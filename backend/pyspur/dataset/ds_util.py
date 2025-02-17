from typing import Any, Dict, Iterator, Set

import pandas as pd


def get_ds_column_names(
    file_path: str,
) -> Set[str]:
    """
    Returns the column names of a pandas compatible dataset file.
    """
    if file_path.endswith(".csv"):
        df: pd.DataFrame = pd.read_csv(file_path)  # type: ignore
    elif file_path.endswith(".parquet"):
        df: pd.DataFrame = pd.read_parquet(file_path)
    elif file_path.endswith(".jsonl"):
        df: pd.DataFrame = pd.read_json(file_path, lines=True)  # type: ignore
    else:
        raise ValueError(f"Unsupported file format: {file_path}")

    # make sure each column name is a string
    df.columns = [str(col) for col in df.columns]

    return set(df.columns)


def get_ds_iterator(
    file_path: str,
) -> Iterator[Dict[str, Any]]:
    """
    Returns an iterator over the rows of a pandas compatible dataset file.
    """
    if file_path.endswith(".csv"):
        df: pd.DataFrame = pd.read_csv(file_path)  # type: ignore
    elif file_path.endswith(".parquet"):
        df: pd.DataFrame = pd.read_parquet(file_path)
    elif file_path.endswith(".jsonl"):
        df: pd.DataFrame = pd.read_json(file_path, lines=True)  # type: ignore
    else:
        raise ValueError(f"Unsupported file format: {file_path}")

    # make sure each column name is a string
    df.columns = [str(col) for col in df.columns]

    for _, row in df.iterrows():  # type: ignore
        yield row.to_dict()  # type: ignore
