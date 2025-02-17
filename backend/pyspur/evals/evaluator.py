# inspired by https://github.com/google-deepmind/gemma/blob/main/colabs/gsm8k_eval.ipynb
import argparse
import asyncio
import importlib.util
import os
import re
from typing import Any, Callable, Dict, List, Optional, Union

import pandas as pd
import yaml
from datasets import Dataset, load_dataset
from jinja2 import Template

from ..evals.common import EQUALITY_TEMPLATE, normalize_extracted_answer
from ..execution.workflow_executor import WorkflowExecutor
from ..schemas.workflow_schemas import WorkflowDefinitionSchema

# Precompiled regular expressions
NUMBER_REGEX = re.compile(r"-?[\d,]*\.?\d+", re.MULTILINE | re.DOTALL | re.IGNORECASE)


def find_numbers(text: str) -> List[str]:
    """Find all numbers in a string."""
    return NUMBER_REGEX.findall(text)


def find_number(text: str, answer_delimiter: str = "The answer is") -> str:
    """Find the most relevant number in a string."""
    if answer_delimiter in text:
        answer = text.split(answer_delimiter)[-1]
        numbers = find_numbers(answer)
        if numbers:
            return numbers[0]
    numbers = find_numbers(text)
    return numbers[-1] if numbers else ""


def maybe_remove_comma(text: str) -> str:
    """Remove commas from numbers in a string."""
    return text.replace(",", "")


def load_dataset_by_name(
    dataset_name: str,
    split: str = "test",
    subset: Optional[str] = None,
    process_docs: Optional[Callable[[Dataset], Dataset]] = None,
) -> Dataset:
    """Load a dataset by name or from a CSV file and return the specified split."""
    if dataset_name.endswith(".csv"):
        dataset = pd.read_csv(dataset_name)
        dataset = Dataset.from_pandas(dataset)
    else:
        dataset_args = {"cache_dir": "/tmp"}
        if subset:
            dataset = load_dataset(dataset_name, subset, **dataset_args)
        else:
            dataset = load_dataset(dataset_name, **dataset_args)
        dataset = dataset[split]
    if process_docs:
        dataset = process_docs(dataset)
    return dataset


# https://github.com/EleutherAI/lm-evaluation-harness/blob/1185e89a044618b5adc6f0b9363b629a19fffdc4/lm_eval/utils.py#L402
def ignore_constructor(loader, node):
    return node


# https://github.com/EleutherAI/lm-evaluation-harness/blob/1185e89a044618b5adc6f0b9363b629a19fffdc4/lm_eval/utils.py#L406
def import_function(loader, node):
    function_name = loader.construct_scalar(node)
    yaml_path = os.path.dirname(loader.name)

    *module_name, function_name = function_name.split(".")
    if isinstance(module_name, list):
        module_name = ".".join(module_name)
    module_path = os.path.normpath(os.path.join(yaml_path, "{}.py".format(module_name)))

    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    function = getattr(module, function_name)
    return function


# https://github.com/EleutherAI/lm-evaluation-harness/blob/1185e89a044618b5adc6f0b9363b629a19fffdc4/lm_eval/utils.py#L423
def load_yaml_config(yaml_path=None, yaml_config=None, yaml_dir=None, mode="full"):
    if mode == "simple":
        constructor_fn = ignore_constructor
    elif mode == "full":
        constructor_fn = import_function

    # Add the import_function constructor to the YAML loader
    yaml.add_constructor("!function", constructor_fn)
    if yaml_config is None:
        with open(yaml_path, "rb") as file:
            yaml_config = yaml.full_load(file)

    if yaml_dir is None:
        yaml_dir = os.path.dirname(yaml_path)

    assert yaml_dir is not None

    if "include" in yaml_config:
        include_path = yaml_config["include"]
        del yaml_config["include"]

        if isinstance(include_path, str):
            include_path = [include_path]

        # Load from the last one first
        include_path.reverse()
        final_yaml_config = {}
        for path in include_path:
            # Assumes that path is a full path.
            # If not found, assume the included yaml
            # is in the same dir as the original yaml
            if not os.path.isfile(path):
                path = os.path.join(yaml_dir, path)

            try:
                included_yaml_config = load_yaml_config(yaml_path=path, mode=mode)
                final_yaml_config.update(included_yaml_config)
            except Exception as ex:
                # If failed to load, ignore
                raise ex

        final_yaml_config.update(yaml_config)
        return final_yaml_config
    return yaml_config


def generate_input_prompt(problem: dict, doc_to_text: str, preamble: str) -> str:
    """Generate the input prompt for the model."""
    question_text = Template(doc_to_text).render(**problem)
    full_prompt = f"{preamble}\n\n{question_text}"
    return full_prompt.strip()


async def check_equality(expr1: str, expr2: str) -> bool:
    """
    Check if two expressions are equal by using the call_model function.

    Args:
        expr1 (str): The first expression.
        expr2 (str): The second expression.

    Returns:
        bool: True if expressions are equal, False otherwise.
    """
    prompt = EQUALITY_TEMPLATE % {"expression1": expr1, "expression2": expr2}
    # response = await call_model(prompt)
    # return response.lower().strip() == "yes"
    # TODO (jean): Implement equality check using simple LLM
    return True


def extract_output_variable(outputs: dict, workflow_output_variable: str) -> Any:
    """
    Extract the output value from the outputs dictionary based on the workflow_output_variable.

    Args:
        outputs (dict): The dictionary containing workflow outputs.
        workflow_output_variable (str): The variable to extract, potentially nested.

    Returns:
        Any: The extracted output value.

    Raises:
        ValueError: If the specified variable is not found or the structure is invalid.
    """
    current_level = outputs
    remaining_variable = workflow_output_variable

    while remaining_variable:
        # Find the longest matching key in the current level
        matched_key = None
        for key in sorted(current_level.keys(), key=len, reverse=True):
            if remaining_variable.startswith(key):
                matched_key = key
                break

        if not matched_key:
            # Debugging: Log available keys for better error diagnosis
            print(f"Current level keys: {list(current_level.keys())}")
            raise ValueError(
                f"Key '{remaining_variable}' not found in the current level of outputs"
            )

        # Descend into the matched key
        current_level = current_level[matched_key]

        # Remove the matched key and the delimiter from the remaining variable
        remaining_variable = remaining_variable[len(matched_key) :]
        if remaining_variable.startswith("-"):
            remaining_variable = remaining_variable[1:]

        # If the remaining variable is empty, return the current level
        if not remaining_variable:
            return current_level

        # If the remaining variable is a single key and the current level is a dictionary,
        # directly return the value if it exists
        if isinstance(current_level, dict) and remaining_variable in current_level:
            return current_level[remaining_variable]

    return current_level


async def execute_workflow(
    full_prompt: str,
    workflow_definition: Optional[WorkflowDefinitionSchema] = None,
    workflow_output_variable: Optional[str] = None,
) -> str:
    """
    Executes an LLM workflow.

    Args:
        full_prompt: The prompt to send
        workflow: Optional workflow definition to execute
        workflow_output_variable: The output variable to extract from workflow results

    Returns:
        str: The model's response text
    """
    if workflow_definition is None:
        raise ValueError("Workflow definition is required")

    # Find input node - we know workflows must have exactly one InputNode
    input_node = next(
        (node for node in workflow_definition.nodes if node.node_type == "InputNode"),
        None,
    )
    if input_node is None:
        raise ValueError("Workflow must have an InputNode")

    # Extract input schema from the InputNode
    input_schema = input_node.config.get("input_schema", {})
    initial_inputs = {input_node.id: {key: full_prompt for key in input_schema.keys()}}

    # Execute workflow with error handling
    executor = WorkflowExecutor(workflow_definition)
    try:
        outputs = await executor(initial_inputs)
        outputs = {k: v.model_dump() for k, v in outputs.items()}
    except Exception as e:
        # Log the error for debugging purposes
        print(f"Workflow execution failed: {e}")
        # Use an empty output to indicate failure
        outputs = {}

    # Debugging: Log the outputs dictionary and workflow_output_variable
    print(f"Workflow Output Variable: {workflow_output_variable}")

    # Extract output from specified variable using the new function
    outputs = extract_output_variable(outputs, workflow_output_variable)

    print(f"Extracted outputs: {outputs}")
    return str(outputs)


def extract_answer(
    text: str,
    answer_extraction: Dict[str, Any],
) -> str:
    """
    Extracts the answer from text based on extraction logic specified in the configuration.

    Args:
        text (str): The text to extract the answer from.
        answer_extraction (Dict[str, Any]): Configuration for answer extraction, including functions and regexes.

    Returns:
        str: The extracted answer.
    """
    if text is None:
        return ""

    # Extract regexes and functions from the extraction configuration
    regexes = answer_extraction.get("regexes", [])
    functions = answer_extraction.get("functions", [])

    extracted_answer = text

    # Dynamically apply the specified string processing functions in order
    for func_name in functions:
        # Retrieve the function object from the globals() dictionary
        func = globals().get(func_name)
        if func and callable(func):
            extracted_answer = func(extracted_answer)
        else:
            raise ValueError(f"Function '{func_name}' is not defined or not callable.")

    # Apply regex patterns to extract the relevant portion of the response
    for regex in regexes:
        match = re.search(regex, extracted_answer, re.IGNORECASE)
        if match:
            extracted_answer = match.group(1)
            break  # Stop after the first successful match

    return extracted_answer.strip()


async def evaluate_answer(predicted_answer, ground_truth_answer, evaluation: Dict[str, Any]):
    """Evaluates if the predicted answer matches the ground truth based on evaluation logic."""
    if predicted_answer is None or ground_truth_answer is None:
        return False

    evaluation_method = evaluation.get("method", "default").lower()
    if evaluation_method == "numeric":
        try:
            correct = float(predicted_answer) == float(ground_truth_answer)
        except:
            correct = predicted_answer == ground_truth_answer
        return correct
    elif evaluation_method == "exact_match":
        return predicted_answer.strip().lower() == ground_truth_answer.strip().lower()
    elif evaluation_method == "mcq":
        # Normalize both answers before comparison
        return (
            normalize_extracted_answer(predicted_answer).strip().upper()
            == normalize_extracted_answer(ground_truth_answer).strip().upper()
        )
    elif evaluation_method == "math":
        print(f"Checking equality between {predicted_answer} and {ground_truth_answer}")
        return await check_equality(predicted_answer, ground_truth_answer)
    else:
        # Default evaluation method
        return predicted_answer == ground_truth_answer


def get_ground_truth_answer(problem, doc_to_target):
    """Extracts the ground truth answer using the doc_to_target template."""
    doc_to_target_template = Template(doc_to_target)
    ground_truth = doc_to_target_template.render(**problem)
    return ground_truth.strip()


async def evaluate_dataset_batch(
    dataset: Dataset,
    eval_config: Dict[str, Any],
    workflow_definition: WorkflowDefinitionSchema,
    batch_size: int = 10,
    subject: Optional[str] = None,
    subject_category_mapping: Optional[Dict[str, str]] = None,
    category_correct: Optional[Dict[str, int]] = None,
    category_total: Optional[Dict[str, int]] = None,
    output_variable: Optional[str] = None,
) -> dict:
    """
    Evaluate the model on a dataset in batches.

    This function performs the core evaluation logic, including generating prompts,
    calling the model, and comparing predictions with ground truth answers.

    Args:
        dataset: The dataset to evaluate on.
        eval_config: Configuration for the evaluation task.
        workflow: Workflow definition to execute.
        batch_size: Size of batches for processing.
        subject: Optional subject name for categorization.
        subject_category_mapping: Optional mapping of subjects to categories.
        category_correct: Optional dict tracking correct predictions per category.
        category_total: Optional dict tracking total samples per category.
        output_variable: Optional output variable name from workflow output.

    Returns:
        dict: Evaluation metrics, including accuracy and category-wise performance.
    """
    # Extract task configuration
    preamble = eval_config.get("preamble", "")
    doc_to_text = eval_config.get("doc_to_text", "")
    doc_to_target = eval_config.get("doc_to_target", "")
    ground_truth_answer_extraction = eval_config.get("ground_truth_answer_extraction", {})
    predicted_answer_extraction = eval_config.get("predicted_answer_extraction", {})
    evaluation = eval_config.get("evaluation", {})

    # Initialize tracking variables
    all_responses = {}
    short_responses = {}
    total = len(dataset)
    correct = 0
    example_id = 0
    per_example_results = []

    # Initialize category tracking if needed
    if subject_category_mapping and category_correct is None and category_total is None:
        categories = set(subject_category_mapping.values())
        category_correct = {category: 0 for category in categories}
        category_total = {category: 0 for category in categories}

    # Process dataset in batches
    for batch in dataset.iter(batch_size=batch_size):
        transformed_batch = [dict(zip(batch.keys(), values)) for values in zip(*batch.values())]
        full_prompts = [
            generate_input_prompt(problem, doc_to_text, preamble) for problem in transformed_batch
        ]

        # Call the model on all prompts in the batch concurrently
        responses = await asyncio.gather(
            *[
                execute_workflow(prompt, workflow_definition, output_variable)
                for prompt in full_prompts
            ]
        )

        # Process responses and update metrics
        for idx, (problem, full_prompt, response_text) in enumerate(
            zip(transformed_batch, full_prompts, responses)
        ):
            predicted_answer = extract_answer(response_text, predicted_answer_extraction)
            ground_truth_answer = extract_answer(
                get_ground_truth_answer(problem, doc_to_target),
                ground_truth_answer_extraction,
            )

            # Store responses
            all_responses[example_id] = response_text
            short_responses[example_id] = predicted_answer

            # Evaluate correctness
            is_correct = await evaluate_answer(predicted_answer, ground_truth_answer, evaluation)
            correct += int(is_correct)

            # Add per-example results
            per_example_results.append(
                {
                    "example_id": example_id,
                    "prompt": full_prompt,
                    "predicted_answer": predicted_answer,
                    "ground_truth_answer": ground_truth_answer,
                    "is_correct": is_correct,
                }
            )

            # Update category metrics if needed
            if subject_category_mapping:
                subject_value = subject or problem.get("subject") or problem.get("Subject")
                category = subject_category_mapping.get(subject_value, "other")
                category_total[category] += 1
                if is_correct:
                    category_correct[category] += 1

            # Log results
            print(f"Example ID {example_id}")
            print(f"Predicted answer: {predicted_answer}")
            print(f"Ground truth answer: {ground_truth_answer}")
            print(f"Correct: {is_correct}")
            print("=" * 40)
            example_id += 1

    # Calculate final metrics
    metrics = {
        "total_samples": total,
        "correct_predictions": correct,
        "accuracy": correct / total,
        "all_responses": all_responses,
        "short_responses": short_responses,
        "per_example_results": per_example_results,
    }

    if subject_category_mapping:
        category_accuracy = {
            category: (
                category_correct[category] / category_total[category]
                if category_total[category] > 0
                else 0
            )
            for category in category_correct
        }
        metrics.update(
            {
                "category_correct": category_correct,
                "category_total": category_total,
                "category_accuracy": category_accuracy,
            }
        )

    return metrics


def calculate_metrics(
    total_correct: int,
    total_samples: int,
    category_correct: Optional[Dict[str, int]] = None,
    category_total: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """
    Calculate overall and category-wise metrics.

    Args:
        total_correct (int): Total number of correct predictions.
        total_samples (int): Total number of samples evaluated.
        category_correct (Optional[Dict[str, int]]): Correct predictions per category.
        category_total (Optional[Dict[str, int]]): Total samples per category.

    Returns:
        Dict[str, Any]: A dictionary containing overall accuracy and category-wise accuracy.
    """
    overall_accuracy = total_correct / total_samples if total_samples > 0 else 0
    metrics = {
        "total_samples": total_samples,
        "correct_predictions": total_correct,
        "accuracy": overall_accuracy,
    }

    if category_correct and category_total:
        category_accuracy = {
            category: (
                category_correct[category] / category_total[category]
                if category_total[category] > 0
                else 0
            )
            for category in category_correct
        }
        metrics["category_accuracy"] = category_accuracy

    return metrics


async def prepare_and_evaluate_dataset(
    eval_config: Dict[str, Any],
    workflow_definition: WorkflowDefinitionSchema,
    batch_size: int = 10,
    num_samples: Optional[int] = None,
    output_variable: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Prepare the dataset and evaluate the model on it.

    This function handles dataset loading, preprocessing, and category-level metrics.
    It supports evaluating multiple subsets of a dataset and aggregates the results.

    Args:
        eval_config: Configuration for the evaluation task.
        workflow: Workflow definition to execute.
        batch_size: Size of batches for processing.
        num_samples: Optional number of samples to evaluate.
        output_variable: Optional output variable name from workflow output.

    Returns:
        Dict[str, Any]: Evaluation metrics, including accuracy and category-wise metrics.
    """
    # Extract dataset config
    dataset_name = eval_config.get("dataset_name")
    if not dataset_name:
        raise ValueError("dataset_name must be provided in eval_config.")

    dataset_split = eval_config.get("dataset_split", "test")
    dataset_subsets = eval_config.get("dataset_subsets", None)  # Subsets to evaluate
    process_docs = eval_config.get("process_docs")

    # Initialize metrics for aggregation
    subset_metrics = {}
    total_correct = 0
    total_samples = 0
    category_correct = None
    category_total = None

    # Handle multiple subsets if specified
    if dataset_subsets and isinstance(dataset_subsets, list):
        for subset in dataset_subsets:
            # Load the subset of the dataset
            dataset = load_dataset_by_name(dataset_name, dataset_split, subset, process_docs)
            if num_samples is not None:
                dataset = dataset.shuffle(seed=42).select(range(min(num_samples, len(dataset))))

            # Evaluate the subset
            metrics = await evaluate_dataset_batch(
                dataset=dataset,
                eval_config=eval_config,
                workflow_definition=workflow_definition,
                batch_size=batch_size,
                subject=subset,
                subject_category_mapping=eval_config.get("subject_category_mapping"),
                output_variable=output_variable,  # Pass only the variable name
            )

            # Aggregate metrics
            subset_metrics[subset] = metrics
            total_correct += metrics["correct_predictions"]
            total_samples += metrics["total_samples"]

            # Update category-level metrics if applicable
            if "category_correct" in metrics and "category_total" in metrics:
                if category_correct is None:
                    category_correct = metrics["category_correct"]
                    category_total = metrics["category_total"]
                else:
                    for category in metrics["category_correct"]:
                        category_correct[category] += metrics["category_correct"][category]
                        category_total[category] += metrics["category_total"][category]
    else:
        # Single dataset evaluation
        dataset = load_dataset_by_name(dataset_name, dataset_split, None, process_docs)
        if num_samples is not None:
            dataset = dataset.shuffle(seed=42).select(range(min(num_samples, len(dataset))))

        metrics = await evaluate_dataset_batch(
            dataset=dataset,
            eval_config=eval_config,
            workflow_definition=workflow_definition,
            batch_size=batch_size,
            output_variable=output_variable,  # Pass only the variable name
        )

        # Aggregate metrics
        subset_metrics["default"] = metrics
        total_correct = metrics["correct_predictions"]
        total_samples = metrics["total_samples"]
        category_correct = metrics.get("category_correct", None)
        category_total = metrics.get("category_total", None)

    # Calculate overall metrics
    results = calculate_metrics(
        total_correct=total_correct,
        total_samples=total_samples,
        category_correct=category_correct,
        category_total=category_total,
    )
    results["subset_metrics"] = subset_metrics

    return results


if __name__ == "__main__":
    test_dict = {
        "input_node": "hello",
        "node_1732234981946": "hello",
        "node_1732236371719": "hello",
        "node_1732236371719-bd9e35ad-829c-4618-a828-546c4a3e65f6": "hello",
        "node_1732236371719-bd9e35ad-829c-4618-a828-546c4a3e65f6-50292c67-7a0e-4f11-97fc-ba2cd8ee45ef": "hello",
        "node_1732236371719-bd9e35ad-829c-4618-a828-546c4a3e65f6-50292c67-7a0e-4f11-97fc-ba2cd8ee45ef-5ecee81a-746d-4847-abf6-0e6a6d241de3": "hello",
    }
    print(
        extract_output_variable(
            test_dict,
            "bd9e35ad-829c-4618-a828-546c4a3e65f6-50292c67-7a0e-4f11-97fc-ba2cd8ee45ef-5ecee81a-746d-4847-abf6-0e6a6d241de3-correct_option",
        )
    )
