
class PerformanceMonitor:

    def __init__(self, core_count=2):
        self.core_count = core_count
        self.reset()

    def reset(self):
        self.cycles = 0
        self.instructions = 0

        self.memory_reads = 0
        self.memory_writes = 0

        self.write_conflicts = 0
        self.read_write_conflicts = 0
        self.shared_reads = 0

        self.categories = {
            "arithmetic": 0,
            "logical": 0,
            "shift": 0,
            "memory": 0,
            "halt": 0
        }

        self.cores = [
            {
                "instructions": 0,
                "active_cycles": 0,
                "idle_cycles": 0,
                "memory_reads": 0,
                "memory_writes": 0,
                "last_instruction": None
            }
            for _ in range(self.core_count)
        ]

        self.history = []

    def record_cycle(self, events):

        if not events:
            return

        self.cycles += 1

        active_cores = set()
        memory_accesses = {}

        for event in events:

            core_id = event["core"]
            word = event["word"]
            opcode = word >> 12

            active_cores.add(core_id)

            self.instructions += 1

            core = self.cores[core_id]
            core["instructions"] += 1
            core["last_instruction"] = event["source"]

            # Classify the instruction
            if opcode in (0, 1):
                self.categories["arithmetic"] += 1

            elif opcode in (2, 3, 4, 5):
                self.categories["logical"] += 1

            elif opcode in (6, 7):
                self.categories["shift"] += 1

            elif opcode in (8, 9):
                self.categories["memory"] += 1

            elif opcode == 15:
                self.categories["halt"] += 1

            # Track memory operations
            if event["read"] or event["store"]:

                address = word & 0xFF

                access = memory_accesses.setdefault(
                    address, {"reads": 0, "writes": 0}
                )

                if event["read"]:
                    self.memory_reads += 1
                    core["memory_reads"] += 1
                    access["reads"] += 1

                if event["store"]:
                    self.memory_writes += 1
                    core["memory_writes"] += 1
                    access["writes"] += 1

        # Record active and idle cycles
        for core_id in range(self.core_count):

            if core_id in active_cores:
                self.cores[core_id]["active_cycles"] += 1
            else:
                self.cores[core_id]["idle_cycles"] += 1

        # Detect memory interactions
        for access in memory_accesses.values():

            reads = access["reads"]
            writes = access["writes"]

            if writes > 1:
                self.write_conflicts += 1

            if reads > 0 and writes > 0:
                self.read_write_conflicts += 1

            if reads > 1:
                self.shared_reads += 1

        # Save data for graphs
        self.history.append({
            "cycle": self.cycles,
            "ipc": len(events),
            "utilization": (
                len(active_cores) / self.core_count * 100
            ),
            "cores": [
                int(i in active_cores)
                for i in range(self.core_count)
            ]
        })

    def get_metrics(self):

        available_cycles = self.cycles * self.core_count

        ipc = (
            self.instructions / self.cycles
            if self.cycles else 0
        )

        cpi = (
            self.cycles / self.instructions
            if self.instructions else 0
        )

        utilization = (
            self.instructions / available_cycles * 100
            if available_cycles else 0
        )

        core_metrics = []

        for core_id, core in enumerate(self.cores):

            core_utilization = (
                core["active_cycles"] / self.cycles * 100
                if self.cycles else 0
            )

            core_metrics.append({
                **core,
                "id": core_id,
                "utilization": round(core_utilization, 2)
            })

        return {
            "cycles": self.cycles,
            "instructions": self.instructions,
            "ipc": round(ipc, 4),
            "cpi": round(cpi, 4),
            "utilization": round(utilization, 2),
            "idle_cycles": available_cycles - self.instructions,
            "memory_reads": self.memory_reads,
            "memory_writes": self.memory_writes,
            "write_conflicts": self.write_conflicts,
            "read_write_conflicts": self.read_write_conflicts,
            "shared_reads": self.shared_reads,
            "categories": self.categories.copy(),
            "cores": core_metrics
        }
