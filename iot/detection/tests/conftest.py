import sys
from pathlib import Path

DETECTION_DIR = Path(__file__).resolve().parents[1]

if str(DETECTION_DIR) not in sys.path:
    sys.path.insert(0, str(DETECTION_DIR))
