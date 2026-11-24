"""Public CPU API used by the desktop simulator."""

from dualcore.alu import alu
from dualcore.control import Control, control_unit
from dualcore.core import Core
from dualcore.demo import DEMO
from dualcore.isa import ALIASES, MNEMONICS, OPCODES, Decoded, Instruction, assemble, byte, decode, register
from dualcore.processor import Processor
