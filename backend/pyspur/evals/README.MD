# Supported data formats

* HuggingFace Datasets
* Link to CSV
* Blobfile

# Example tasks

- [X] GSM8K
- [X] GPQA
- [X] MATH
- [X] MMLU

# Tips

* When specifying the regex in a task yaml file, make sure you escape backlashes.
  * Option 1: Double quotes with escaped backslashes:
  * Option 2: Single quotes (which automatically escapes special characters)
  * Do not use a raw string literal `r` like in Python