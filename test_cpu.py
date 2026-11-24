import unittest

from cpu import DEMO, Processor, alu, assemble, control_unit, decode


class ProcessorTests(unittest.TestCase):
    def test_alu(self):
        vectors = [
            (0, 250, 10, 4), (1, 3, 7, 252), (2, 0xAA, 0xCC, 0x88),
            (3, 0xAA, 0xCC, 0xEE), (4, 0xAA, 0xCC, 0x66),
            (5, 0xAA, 0xCC, 0x11), (6, 0x81, 1, 2),
            (7, 0x81, 1, 0x40), (6, 0xFF, 8, 0), (7, 0xFF, 8, 0),
        ]
        for op, left, right, expected in vectors:
            with self.subTest(op=op, left=left, right=right):
                self.assertEqual(alu(op, left, right), expected)

    def test_instruction_encoding(self):
        program = assemble("# comment\nADD R3, R1, R2\nSW R3, 0x20\nLW R4, 0x20\nHALT")
        self.assertEqual([i.word for i in program], [0x0650, 0x9620, 0x8820, 0xF000])
        instruction = decode(program[0].word)
        self.assertEqual((instruction.opcode, instruction.rd, instruction.rs, instruction.rt), (0, 3, 1, 2))
        with self.assertRaisesRegex(ValueError, "Illegal opcode"):
            decode(0xB000)
        for word in [0x0651, 0x8920, 0xF001]:
            with self.assertRaisesRegex(ValueError, "Reserved"):
                decode(word)
        for bad in ["ADD R8, R0, R1", "LOAD R0, 256", "HALT R0", "BOGUS"]:
            with self.subTest(bad=bad), self.assertRaisesRegex(ValueError, "Line 2"):
                assemble("# comment\n" + bad)

    def test_control_signals(self):
        for opcode in range(8):
            self.assertEqual(control_unit(opcode).alu, opcode)
            self.assertTrue(control_unit(opcode).register_write)
        self.assertTrue(control_unit(8).memory_read)
        self.assertTrue(control_unit(8).register_write)
        self.assertTrue(control_unit(9).memory_write)
        self.assertFalse(control_unit(9).register_write)
        self.assertTrue(control_unit(15).halt)
        self.assertFalse(control_unit(15).register_write)

    def test_single_core(self):
        cpu = Processor(assemble("NOR R0, R0, R0\nSTORE R0, 255\nLOAD R7, 255\nHALT"))
        while cpu.active:
            cpu.tick()
        core = cpu.cores[0]
        self.assertEqual((core.pc, core.registers[0], core.registers[7]), (3, 255, 255))
        self.assertTrue(core.halted)
        self.assertEqual(cpu.memory[255], 255)
        self.assertEqual(cpu.tick(), [])
        self.assertEqual(cpu.cycle, 4)

    def test_dual_core_demo(self):
        cpu = Processor(*(assemble(source) for source in DEMO))
        first, second = cpu.cores
        for _ in range(3):
            cpu.tick()
        self.assertEqual((first.registers[3], second.registers[3]), (2, 1))
        self.assertEqual(cpu.memory[32], 0)
        cpu.tick()
        self.assertEqual((cpu.memory[32], second.registers[4]), (2, 0))
        cpu.tick()
        self.assertTrue(first.halted)
        self.assertFalse(second.halted)
        self.assertEqual((first.pc, second.pc), (4, 5))
        self.assertEqual(second.registers[5], 2)
        cpu.tick()
        self.assertTrue(second.halted)
        self.assertFalse(cpu.active)

    def test_conflicting_stores_commit_in_core_order(self):
        cpu = Processor(assemble("STORE R0, 255"), assemble("STORE R0, 255"))
        cpu.cores[0].registers[0] = 9
        cpu.cores[1].registers[0] = 10
        cpu.tick()
        self.assertEqual(cpu.memory[255], 10)
        for address in (-1, 256):
            with self.assertRaises(IndexError):
                _ = cpu.memory[address]
            with self.assertRaises(IndexError):
                cpu.memory[address] = 0

    def test_empty_and_fallthrough_programs(self):
        cpu = Processor(assemble(""), assemble("NOR R7, R0, R0"))
        self.assertEqual(len(cpu.tick()), 1)
        self.assertFalse(cpu.active)
        self.assertFalse(cpu.cores[1].halted)
        self.assertEqual(cpu.cores[1].pc, 1)


if __name__ == "__main__":
    unittest.main()
