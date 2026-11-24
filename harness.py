"""Run the component and integration checks for stages 01–04."""

import argparse
import unittest
from pathlib import Path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["verify"])
    parser.parse_args()
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).resolve().parent), pattern="test_cpu.py")
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
