import pandas as pd
import os

def clean_duplicates(df: pd.DataFrame, save_dupes_path: str = None) -> pd.DataFrame:
    """
    Checks the dataframe for exact duplicate rows.
    If duplicates are found, drops them (keeping only the first occurrence).
    Optionally saves the list of duplicates to a separate file for auditing.
    """
    # Create a copy to avoid modifying the original dataframe
    df_cleaned = df.copy()

    # duplicated() returns True/False for each row
    # keep='first' means we consider the first occurrence as the original
    duplicate_mask = df_cleaned.duplicated(keep='first')
    num_duplicates = duplicate_mask.sum()

    print(f"\n--- DUPLICATE CHECK ---")
    print(f"Exact duplicates found: {num_duplicates}")

    if num_duplicates > 0:
        # If a path is provided, save the dropped duplicates for review
        if save_dupes_path:
            dupes_df = df_cleaned[duplicate_mask]
            try:
                dupes_df.to_excel(save_dupes_path, index=False)
                print(f"List of duplicates saved for review at: {save_dupes_path}")
            except Exception as e:
                print(f"Failed to save duplicates file: {e}")

        # Drop duplicates and reset the index to keep row numbering clean
        df_cleaned = df_cleaned.drop_duplicates(keep='first').reset_index(drop=True)
        print("Duplicates successfully removed!")
    else:
        print("Congratulations! No duplicates found. The data is perfect.")

    return df_cleaned


