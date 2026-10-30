"""Convert Ryan's four CSV coefficient lists for the shared teaching highlighter.

Usage: python3 utils/build_sycophancy_weights.py --source-dir /path/to/3_6_analyses
Original CSVs remain untouched. The output is a lexical visualization, not a
glmnet prediction: no intercept, IDF multiplier, or probability is invented.
"""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from pathlib import Path

FILES = {'framing': '6a_lasso_framing.csv', 'validation': '6b_lasso_validation.csv',
         'indirectness': '6c_lasso_indirectness.csv', 'combined': '6c_lasso_any.csv'}


def convert(folder):
    result = {'sourceCommit': 'a0c5697ccba084ef4cceb6485d150b0023d26acd',
              'sourceRepo': 'https://github.com/kayaulai/syco-feats',
              'combinedTarget': 'framing AND validation AND indirectness', 'models': {}}
    for dimension, filename in FILES.items():
        path = folder / filename
        rows = list(csv.DictReader(path.open(newline='', encoding='utf-8')))
        weights, excluded, normalized = {}, [], set()
        for index, row in enumerate(rows, 1):
            term, value = row['rowname'], float(row['.'])
            if term.startswith('judge_x_pos'):
                reason = 'non-text categorical predictor'
            elif not re.search(r'[A-Za-z0-9]', term):
                reason = 'whitespace or punctuation not matched by the word highlighter'
            else:
                key = ''.join(c for c in unicodedata.normalize('NFD', term) if not unicodedata.combining(c))
                key = re.sub(r'[^a-z0-9]', '', key.lower())
                if key in normalized:
                    raise ValueError(f'{filename}: colliding lexical key {term!r}')
                normalized.add(key)
                weights[term] = value
                continue
            excluded.append({'row': index, 'feature': term, 'weight': value, 'reason': reason})
        result['models'][dimension] = {
            'sourceFile': filename, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'sourceRows': len(rows), 'lemmatize': False, 'minWeight': 0,
            'labels': {'positive': 'the target pattern', 'negative': 'absence of the target pattern'},
            'weights': weights, 'excluded': excluded}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / 'docs/week_12/12a/weights.json'
    target.write_text(json.dumps(convert(args.source_dir), ensure_ascii=False, indent=2) + '\n')
