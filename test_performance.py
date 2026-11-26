
import unittest
from website import simulate


class TestPerformance(unittest.TestCase):

    def test_dual_core(self):

        frames = simulate({
            "sources": [
                "ADD R1, R2, R3\n"
                "SUB R2, R1, R3\n"
                "STORE R2, 0x20\n"
                "HALT",

                "AND R1, R2, R3\n"
                "LOAD R2, 0x20\n"
                "HALT"
            ]
        })

        metrics = frames[-1]["performance"]

        self.assertEqual(metrics["cycles"], 4)
        self.assertEqual(metrics["instructions"], 7)
        self.assertEqual(metrics["ipc"], 1.75)
        self.assertAlmostEqual(metrics["cpi"], 4 / 7, places=4)
        self.assertEqual(metrics["utilization"], 87.5)
        self.assertEqual(metrics["idle_cycles"], 1)
        self.assertEqual(metrics["memory_reads"], 1)
        self.assertEqual(metrics["memory_writes"], 1)

        self.assertEqual(
            metrics["cores"][0]["utilization"], 100
        )

        self.assertEqual(
            metrics["cores"][1]["utilization"], 75
        )

    def test_write_conflict(self):

        frames = simulate({
            "sources": [
                "STORE R1, 0x20\nHALT",
                "STORE R2, 0x20\nHALT"
            ]
        })

        metrics = frames[-1]["performance"]

        self.assertEqual(metrics["write_conflicts"], 1)
        self.assertEqual(metrics["memory_writes"], 2)

    def test_read_write_conflict(self):

        frames = simulate({
            "sources": [
                "STORE R1, 0x20\nHALT",
                "LOAD R2, 0x20\nHALT"
            ]
        })

        metrics = frames[-1]["performance"]

        self.assertEqual(metrics["read_write_conflicts"], 1)

    def test_initial_state(self):

        frames = simulate({
            "sources": ["HALT", "HALT"]
        })

        metrics = frames[0]["performance"]

        self.assertEqual(metrics["cycles"], 0)
        self.assertEqual(metrics["instructions"], 0)
        self.assertEqual(metrics["ipc"], 0)
        self.assertEqual(metrics["utilization"], 0)


if __name__ == "__main__":
    unittest.main()
