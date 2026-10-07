# SPDX-FileCopyrightText: 2026 Dennis Klein <d.klein@gsi.de>
# SPDX-License-Identifier: Apache-2.0
"""Unit tests of the voice tool. They need neither the model nor its Python
packages; the few that need numpy skip without it. From the repository root:

    python3 -m unittest discover -s voice/tests -t .
"""

import sys
from pathlib import Path

# The tool runs as a script with voice/ on the path, so the tests import it the same way.
VOICE = str(Path(__file__).resolve().parents[1])
if VOICE not in sys.path:
    sys.path.insert(0, VOICE)
