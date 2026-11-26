const $ = (id) => document.getElementById(id);
const hex = (value, width = 2) =>
  value.toString(16).toUpperCase().padStart(width, "0");
const canvas = $("diagram");
const ctx = canvas.getContext("2d");
const stageDuration = 1150;
let animation = null,
  progress = 0,
  lastAnimationTime;
let speed = 1;
let config,
  frames = [],
  cursor = 0,
  timer = null,
  mode = "instruction",
  requestId = 0;

const stages = ["Commit", "Fetch", "Decode", "Execute"];
const lastCursor = () => Math.max(0, (frames.length - 1) * stages.length);

function diagram(frame, eventFrame, phase, progress) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(canvas.width / 1050, 0, 0, canvas.height / 420, 0, 0);
  const colors = { data: "#62e4c0", control: "#ffc879", idle: "#496477" };

  function text(x, y, value, color = "#e5f2fb", size = 14) {
    ctx.font = size + "px Consolas, monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  }

  function block(x, y, w, title, detail, active, shape) {
    const h = 46;
    const fill = ctx.createLinearGradient(x, y, x, y + h);
    fill.addColorStop(0, active ? "#214d4e" : "#20354c");
    fill.addColorStop(1, active ? "#132f37" : "#142437");
    ctx.fillStyle = fill;
    ctx.strokeStyle = active ? colors.data : colors.idle;
    ctx.lineWidth = active ? 1.7 : 1;

    function polygon(points) {
      ctx.beginPath();
      points.forEach(([dx, dy], i) => {
        if (i) ctx.lineTo(x + dx, y + dy);
        else ctx.moveTo(x + dx, y + dy);
      });
      ctx.closePath();
    }

    switch (shape) {
      case "alu":
        polygon([
          [0, 0],
          [w, 10],
          [w, 36],
          [0, h],
          [0, 29],
          [13, 23],
          [0, 17],
        ]);
        break;
      case "mux":
        polygon([
          [0, 12],
          [30, 0],
          [w, 0],
          [w, h],
          [30, h],
          [0, h - 12],
        ]);
        break;
      case "decoder":
        polygon([
          [0, 0],
          [w - 15, 0],
          [w, 13],
          [w, 33],
          [w - 15, h],
          [0, h],
        ]);
        break;
      case "control":
        polygon([
          [12, 0],
          [w - 12, 0],
          [w, 10],
          [w, 36],
          [w - 12, h],
          [12, h],
          [0, 36],
          [0, 10],
        ]);
        break;
      case "pc":
        polygon([
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
          [0, 31],
          [9, 24],
          [0, 17],
        ]);
        break;
      case "memory":
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + 8, w / 2, 8, 0, Math.PI, 2 * Math.PI);
        ctx.ellipse(x + w / 2, y + h - 7, w / 2, 7, 0, 0, Math.PI);
        ctx.closePath();
        break;
      default:
        if (shape === "rom") {
          ctx.beginPath();
          for (let pin = 15; pin < w; pin += 15) {
            ctx.moveTo(x + pin, y - 5);
            ctx.lineTo(x + pin, y);
            ctx.moveTo(x + pin, y + h);
            ctx.lineTo(x + pin, y + h + 5);
          }
          ctx.stroke();
        }
        if (shape === "registers") {
          for (const offset of [8, 4]) {
            ctx.fillRect(x - offset, y - offset, w, h);
            ctx.strokeRect(x - offset, y - offset, w, h);
          }
        }
        polygon([
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ]);
    }
    ctx.fill();
    ctx.stroke();

    if (shape === "memory") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 8, w / 2, 8, 0, 0, Math.PI);
      ctx.stroke();
    }
    text(x + w / 2, y + (shape === "memory" ? 24 : 16), title);
    text(x + w / 2, y + (shape === "memory" ? 38 : 33), detail, "#aec7d9", 12);
  }

  function wire(points, active, control = false, delay = 0) {
    const color = active
      ? control
        ? colors.control
        : colors.data
      : colors.idle;
    ctx.strokeStyle = color;
    ctx.lineWidth = active ? 2.7 : 1.2;
    ctx.setLineDash(control ? [5, 4] : []);
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    const [x, y] = points.at(-1),
      [px, py] = points.at(-2);
    const angle = Math.atan2(y - py, x - px);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (const offset of [-0.55, 0.55]) {
      ctx.lineTo(
        x - 8 * Math.cos(angle + offset),
        y - 8 * Math.sin(angle + offset),
      );
    }
    ctx.fill();
    if (!active || progress < delay) return;
    const segments = points.slice(1).map(([endX, endY], i) => {
      const [startX, startY] = points[i];
      return {
        startX,
        startY,
        dx: endX - startX,
        dy: endY - startY,
        length: Math.hypot(endX - startX, endY - startY),
      };
    });
    const length = segments.reduce((sum, segment) => sum + segment.length, 0);
    const distance = Math.min(1, (progress - delay) / (1 - delay)) * length;
    const trailStart = Math.max(0, distance - 30);
    let segmentStart = 0;
    for (const segment of segments) {
      const segmentEnd = segmentStart + segment.length;
      if (segmentEnd < trailStart) {
        segmentStart = segmentEnd;
        continue;
      }
      const from =
        (Math.max(segmentStart, trailStart) - segmentStart) / segment.length;
      const to =
        (Math.min(segmentEnd, distance) - segmentStart) / segment.length;
      const dotX = segment.startX + segment.dx * to;
      const dotY = segment.startY + segment.dy * to;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(
        segment.startX + segment.dx * from,
        segment.startY + segment.dy * from,
      );
      ctx.lineTo(dotX, dotY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (segmentEnd < distance) {
        segmentStart = segmentEnd;
        continue;
      }
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#f5ffff";
      ctx.beginPath();
      ctx.arc(dotX, dotY, control ? 3 : 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
  }

  const memoryOps = [];
  for (const [index, left] of [
    [0, 25],
    [1, 550],
  ]) {
    const core = frame?.cores[index];
    const event = eventFrame?.events.find((item) => item.core === index);
    const instruction = event?.source.split(/[ ,]/)[0].toUpperCase();
    const fetch = Boolean(event && phase === 1);
    const decoding = Boolean(event && phase === 2);
    const executing = Boolean(event && phase === 3);
    const commit = Boolean(event && phase === 0);
    const read = executing && event.read,
      store = (executing || commit) && event.store;
    const alu = executing && event.alu,
      write = commit && event.write;
    const address = event ? hex(event.word & 255) : "";
    const path = (points, active, control, delay) =>
      wire(
        points.map(([x, y]) => [left + x, y]),
        active,
        control,
        delay,
      );
    const unit = (x, ...args) => block(left + x, ...args);

    const accent = index ? "#adadff" : "#68e6ce";
    const backplane = ctx.createLinearGradient(left, 5, left + 500, 329);
    backplane.addColorStop(0, index ? "#171f3a" : "#122d3a");
    backplane.addColorStop(1, "#0c1828");
    ctx.fillStyle = backplane;
    ctx.strokeStyle = index ? "#394273" : "#2b5761";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(left - 7, 5, 500, 324, 11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(left + 10, 11, 3, 14);
    text(left + 56, 18, "CORE " + index, accent, 15);
    text(
      left + 252,
      18,
      instruction ?? (core?.halted ? "HALTED" : "IDLE"),
      event ? colors.data : "#91a9c1",
      14,
    );
    text(
      left + 428,
      18,
      "PC " + (core ? hex(core.pc, 4) : "0000"),
      "#a4bdd5",
      12,
    );
    path(
      [
        [107, 63],
        [151, 63],
      ],
      fetch,
    );
    path(
      [
        [275, 63],
        [328, 63],
      ],
      fetch,
      false,
      0.42,
    );
    path(
      [
        [389, 86],
        [389, 111],
      ],
      decoding,
      true,
    );
    path(
      [
        [328, 125],
        [72, 125],
        [72, 86],
      ],
      commit,
      true,
    );
    path(
      [
        [328, 75],
        [294, 75],
        [294, 151],
        [103, 151],
        [103, 172],
      ],
      decoding && (event.alu || event.store || event.write),
    );
    path(
      [
        [450, 63],
        [473, 63],
        [473, 197],
        [447, 197],
      ],
      read || store,
    );
    path(
      [
        [350, 157],
        [350, 165],
        [230, 165],
        [230, 180],
      ],
      alu,
      true,
    );
    path(
      [
        [433, 157],
        [433, 180],
      ],
      read || store,
      true,
    );
    path(
      [
        [450, 132],
        [461, 132],
        [461, 269],
        [380, 269],
        [380, 279],
      ],
      write,
      true,
    );
    path(
      [
        [156, 194],
        [181, 194],
      ],
      alu,
      false,
      0.25,
    );
    path(
      [
        [156, 212],
        [181, 212],
      ],
      alu,
      false,
      0.25,
    );
    path(
      [
        [134, 226],
        [134, 247],
        [360, 247],
        [360, 226],
      ],
      store,
    );
    path(
      [
        [275, 203],
        [287, 203],
        [287, 263],
        [269, 263],
        [269, 279],
      ],
      write && event.alu,
    );
    path(
      [
        [392, 226],
        [392, 255],
        [339, 255],
        [339, 279],
      ],
      write && event.read,
    );
    path(
      [
        [230, 303],
        [79, 303],
        [79, 226],
      ],
      write,
      false,
      0.42,
    );

    const port = index === 0 ? 175 : 870;
    path(
      [
        [409, 226],
        [409, 345],
        [port - left, 345],
        [port - left, 372],
      ],
      store,
      false,
      0.42,
    );
    path(
      [
        [port + 22 - left, 372],
        [port + 22 - left, 355],
        [428, 355],
        [428, 226],
      ],
      read,
    );
    if (read || store) {
      const value = (read ? eventFrame.cores[index] : core).registers[
        (event.word >> 9) & 7
      ];
      memoryOps.push(
        "C" +
          index +
          (read ? " reads snapshot " : commit ? " commits " : " buffers ") +
          "M[" +
          address +
          "] = " +
          hex(value),
      );
    }

    unit(
      13,
      40,
      94,
      "PC / +1",
      core ? hex(core.pc, 4) : "\u2014",
      fetch || commit,
      "pc",
    );
    unit(
      151,
      40,
      124,
      "Instruction ROM",
      event ? "PC " + hex(event.pc, 4) : "16-bit words",
      fetch,
      "rom",
    );
    unit(
      328,
      40,
      122,
      "Decoder",
      event ? "IR " + hex(event.word, 4) : "opcode / fields",
      decoding,
      "decoder",
    );
    unit(
      328,
      111,
      122,
      "Control unit",
      event?.halt ? "HALT \u00b7 hold PC" : event ? instruction : "idle",
      decoding || Boolean(commit && event.halt),
      "control",
    );
    unit(
      26,
      180,
      130,
      "Register file",
      "R0\u2013R7 \u00d7 8 bits",
      alu || write || store,
      "registers",
    );
    unit(
      181,
      180,
      94,
      "ALU",
      alu ? instruction : "8-bit",
      alu || Boolean(write && event.alu),
      "alu",
    );
    unit(
      332,
      180,
      115,
      "Memory I/O",
      read || store ? "0x" + address : "8-bit bus",
      read || store,
    );
    unit(
      230,
      279,
      150,
      "Writeback MUX",
      write ? (event.read ? "memory \u2192 Rd" : "ALU \u2192 Rd") : "idle",
      write,
      "mux",
    );
  }
  block(
    155,
    366,
    750,
    "Shared data memory \u00b7 256 \u00d7 8 bits",
    memoryOps.join("    |    ") ||
      "Read start-of-clock snapshot \u00b7 commit stores at clock end",
    memoryOps.length,
    "memory",
  );
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

const instructionInfo = {
  ADD: "Add the two source registers and save the low 8 bits.",
  SUB: "Subtract the second source from the first and save the low 8 bits.",
  AND: "Keep bits that are 1 in both sources.",
  OR: "Keep bits that are 1 in either source.",
  XOR: "Keep bits that differ between the sources.",
  NOR: "Set bits that are 0 in both sources.",
  SLL: "Shift the first source left by the number in the second source.",
  SRL: "Shift the first source right by the number in the second source, filling with zeros.",
  LOAD: "Copy a byte from the shared memory address into the destination register.",
  STORE: "Copy a register byte to the shared memory address at commit.",
  HALT: "Stop this core and hold its program counter.",
};

const stageOrder = ["Fetch", "Decode", "Execute", "Commit"];

function stageCards(frame, eventFrame, phase) {
  const stage = cursor ? stages[phase] : null;
  $("stage").textContent = stage ?? "Ready";
  const current = stageOrder.indexOf(stage);
  stageOrder.forEach((name, index) => {
    const item = $("stage" + name);
    item.classList.toggle("is-current", index === current);
    item.classList.toggle("is-complete", index < current);
    if (index === current) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  const panel = $("stageDetails");
  panel.replaceChildren();
  if (!stage) {
    panel.append(
      element(
        "p",
        mode === "instruction"
          ? "Choose a command and start playback to follow it through the circuit."
          : "Assemble the programs, then press Run to follow both cores.",
      ),
    );
    return;
  }
  for (const event of eventFrame.events) {
    const core = frame.cores[event.core];
    const mnemonic = event.source.split(/[\s,]+/)[0].toUpperCase();
    const name = { LW: "LOAD", SW: "STORE" }[mnemonic] ?? mnemonic;
    const address = event.word & 255;
    const destination = (event.word >> 9) & 7;
    let explanation;
    switch (stage) {
      case "Fetch":
        explanation =
          "Use program counter " +
          hex(event.pc, 4) +
          " to read instruction word 0x" +
          hex(event.word, 4) +
          ".";
        break;
      case "Decode":
        explanation =
          "Opcode " +
          (event.word >> 12).toString(2).padStart(4, "0") +
          " selects " +
          name +
          ". " +
          instructionInfo[name];
        break;
      case "Execute":
        if (event.alu) {
          const rs = (event.word >> 6) & 7,
            rt = (event.word >> 3) & 7;
          explanation =
            "The ALU receives R" +
            rs +
            " = 0x" +
            hex(core.registers[rs]) +
            " and R" +
            rt +
            " = 0x" +
            hex(core.registers[rt]) +
            ".";
        } else if (event.read) {
          explanation =
            "Read 0x" +
            hex(frame.memory[address]) +
            " from address 0x" +
            hex(address) +
            " as it was at the start of this clock.";
        } else if (event.store) {
          explanation =
            "Queue 0x" +
            hex(core.registers[destination]) +
            " for address 0x" +
            hex(address) +
            ". The write becomes visible at commit.";
        } else {
          explanation = "Signal the core to stop at the end of this clock.";
        }
        break;
      default:
        if (event.write) {
          explanation =
            "Write 0x" +
            hex(core.registers[destination]) +
            " to R" +
            destination +
            " and advance the program counter.";
        } else if (event.store) {
          explanation =
            "Apply the queued store. Address 0x" +
            hex(address) +
            " now contains 0x" +
            hex(frame.memory[address]) +
            " after both cores' writes.";
        } else {
          explanation =
            "Core " +
            event.core +
            " stopped at program counter " +
            hex(core.pc, 4) +
            ".";
        }
    }
    const card = element("article", "", "stage-card");
    card.append(
      element("strong", "Core " + event.core + " \u00b7 " + event.source),
      element("p", explanation),
    );
    panel.append(card);
  }
}

function render() {
  const position = Math.floor(cursor / stages.length),
    phase = cursor % stages.length;
  const frame = frames[position],
    previous = phase === 0 ? frames[position - 1] : null;
  const eventFrame = frames[position + Number(phase !== 0)];
  updatePerformanceDashboard(frame, position);
  updateMemoryAnalyzer(frame, position);
  drawCircuit();
  $("clock").textContent =
    "CLOCK " + String(eventFrame?.clock ?? 0).padStart(2, "0");
  stageCards(frame, eventFrame, phase);
  $("run").disabled = !lastCursor() || Boolean(timer);
  $("reset").disabled = !frame;
  $("pause").disabled = !timer;
  const memoryScroll = $("memory").scrollTop;
  $("memoryAccess").textContent = "";
  for (const id of ["registers", "memory", "trace"]) $(id).replaceChildren();
  if (!frame) {
    $("memoryAccess").textContent =
      "LOAD and STORE will show the addresses they use here.";
    return;
  }

  frame.cores.forEach((core, index) => {
    const state = core.halted
      ? "HALTED"
      : core.next
        ? "NEXT L" + core.next
        : "END";
    $("registers").append(
      element(
        "div",
        "Core " +
          index +
          "  \u00b7  PC " +
          hex(core.pc, 4) +
          "  \u00b7  " +
          state,
        "core-label",
      ),
    );
    const row = element("div", "", "reggrid");
    core.registers.forEach((value, reg) => {
      row.append(
        element(
          "span",
          "R" + reg + " " + hex(value),
          previous && previous.cores[index].registers[reg] !== value
            ? "changed"
            : "",
        ),
      );
    });
    $("registers").append(row);
  });

  const accesses = new Map();
  const snapshot = phase ? frame : frames[position - 1];
  if (snapshot && (phase === 3 || phase === 0)) {
    for (const event of eventFrame.events.filter(
      (event) => event.read || event.store,
    )) {
      const address = event.word & 255;
      const label = "0x" + hex(address);
      const value = event.store
        ? snapshot.cores[event.core].registers[(event.word >> 9) & 7]
        : snapshot.memory[address];
      const description = event.store ? "writes" : "reads";
      const access = accesses.get(address) ?? { read: false, store: false };
      access.read ||= event.read;
      access.store ||= event.store;
      accesses.set(address, access);
      $("memoryAccess").append(
        element(
          "div",
          "C" +
            event.core +
            " " +
            description +
            " 0x" +
            hex(value) +
            (event.store ? " to " : " from ") +
            label +
            (event.store && phase === 3
              ? " (buffered)"
              : event.read
                ? " (snapshot)"
                : ""),
        ),
      );
    }
  }
  const usedAddresses = new Set(accesses.keys());
  for (let clock = 1; clock <= position; clock++) {
    for (const event of frames[clock].events) {
      if (event.read || event.store) usedAddresses.add(event.word & 255);
    }
  }
  if (!usedAddresses.size) {
    $("memoryAccess").textContent =
      "No shared memory used yet. LOAD reads a byte and STORE writes one.";
  }

  let firstActiveCell;
  for (const address of [...usedAddresses].sort((a, b) => a - b)) {
    const access = accesses.get(address);
    const cell = element("div", "", "memory-cell");
    if (access?.read) cell.classList.add("memory-read");
    if (access?.store) cell.classList.add("memory-write");
    cell.append(
      element("span", "Address 0x" + hex(address), "memory-address"),
      element(
        "strong",
        "Value 0x" + hex(frame.memory[address]),
        "memory-value",
      ),
    );
    $("memory").append(cell);
    if (access && !firstActiveCell) firstActiveCell = cell;
  }
  $("memory").scrollTop = firstActiveCell
    ? firstActiveCell.offsetTop
    : memoryScroll;

  const history = frames
    .slice(Math.max(1, position - 9), position + 1)
    .reverse();
  for (const item of history) {
    for (const event of item.events) {
      const row = element("div", "", "event");
      row.append(
        element("strong", "T" + item.clock + "  C" + event.core + "  "),
        element("span", hex(event.word, 4) + "  "),
        document.createTextNode(event.source),
        document.createElement("br"),
        element("span", event.effect),
      );
      $("trace").append(row);
    }
  }
  if (!history.length) {
    $("trace").append(
      element(
        "div",
        "History appears after the first instruction commits.",
        "core-label",
      ),
    );
  }
}

function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function drawCircuit() {
  const phase = cursor % stages.length;
  const position = Math.floor(cursor / stages.length);
  if (cursor)
    $("stage" + stages[phase]).style.setProperty(
      "--phase-progress",
      progress * 100 + "%",
    );
  diagram(
    frames[position],
    frames[position + Number(phase !== 0)],
    phase,
    progress,
  );
}

function pause() {
  timer = null;
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
}

function animate(now) {
  const elapsed = now - (lastAnimationTime ?? now);
  lastAnimationTime = now;
  progress = Math.min(1, progress + (elapsed * speed) / stageDuration);
  drawCircuit();
  if (progress === 1) {
    if (cursor >= lastCursor()) {
      pause();
      status("Playback complete.");
      render();
      return;
    }
    ++cursor;
    progress = 0;
    render();
  }
  animation = requestAnimationFrame(animate);
}

function play() {
  if (timer || !lastCursor()) return;
  if (!cursor || progress === 1) {
    cursor = 1;
    progress = 0;
  }
  lastAnimationTime = undefined;
  timer = true;
  animation = requestAnimationFrame(animate);
  render();
}

function invalidate() {
  ++requestId;
  pause();
  cursor = 0;
  progress = 0;
  frames = [];
  status("");
  render();
}

async function load(autoPlay = false) {
  invalidate();
  const request = requestId;
  const sources = [$("source0").value, $("source1").value];
  const payload = { sources };
  if (mode === "instruction") {
    sources.fill("");
    sources[Number($("target").value)] = $("command").value;
    payload.seed = ["r1", "r2", "sample"].map((id) => $(id).value);
  }
  status("Assembling\u2026");
  try {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (request !== requestId) return;
    frames = data.frames;
    status(
      autoPlay
        ? "Playing instruction."
        : lastCursor()
          ? "Assembled. Press Run to play."
          : "No instructions to run.",
    );
    if (autoPlay) play();
    else render();
  } catch (error) {
    if (request === requestId) status(error.message, true);
  }
}

function selectMode(selection) {
  mode = selection;
  for (const name of ["instruction", "program"]) {
    $(name + "Panel").hidden = name !== mode;
    $(name + "Mode").setAttribute("aria-pressed", String(name === mode));
  }
  invalidate();
}

function fillCommand() {
  const opcode = $("opcode").value;
  const operands = { LOAD: " R3, 0x20", STORE: " R1, 0x20", HALT: "" };
  $("opcodeHelp").textContent = instructionInfo[opcode] ?? "";
  $("command").value = opcode + (operands[opcode] ?? " R3, R1, R2");
  invalidate();
}

$("instructionMode").onclick = () => selectMode("instruction");
$("programMode").onclick = () => selectMode("program");
$("opcode").onchange = fillCommand;
$("execute").onclick = () => load(true);
$("assemble").onclick = () => load();
$("demo").onclick = () => {
  [$("source0").value, $("source1").value] = config.demo;
  load();
};
$("reset").onclick = () => {
  pause();
  cursor = 0;
  progress = 0;
  render();
};
$("run").onclick = play;
$("speed").oninput = (event) => {
  speed = Number(event.target.value);
  $("speedValue").value = speed + "\u00d7";
};
$("pause").onclick = () => {
  pause();
  render();
};
$("command").onkeydown = (event) => {
  if (event.key === "Enter") load(true);
};
for (const id of [
  "command",
  "target",
  "r1",
  "r2",
  "sample",
  "source0",
  "source1",
])
  $(id).oninput = invalidate;
new ResizeObserver(drawCircuit).observe(canvas);

async function start() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Could not load the CPU configuration.");
    config = await response.json();
    $("opcode").replaceChildren(
      ...config.opcodes.map((name) => new Option(name, name)),
    );
    [$("source0").value, $("source1").value] = config.demo;
    fillCommand();
    await load();
  } catch (error) {
    status(error.message, true);
  }
}
// =====================================
// CPU PERFORMANCE MONITOR
// =====================================

function updatePerformanceDashboard(frame, position) {
  const metrics = frame?.performance;
  const setValue = (id, value) => {
    const target = $(id);
    if (target) target.textContent = value;
  };

  setValue("perfCycles", metrics?.cycles ?? 0);
  setValue("perfInstructions", metrics?.instructions ?? 0);
  setValue("perfIPC", (metrics?.ipc ?? 0).toFixed(2));
  setValue("perfCPI", (metrics?.cpi ?? 0).toFixed(4));
  setValue("perfUtilization", (metrics?.utilization ?? 0).toFixed(1) + "%");
  setValue("perfIdle", metrics?.idle_cycles ?? 0);
  setValue("perfReads", metrics?.memory_reads ?? 0);
  setValue("perfWrites", metrics?.memory_writes ?? 0);
  setValue("perfWriteConflicts", metrics?.write_conflicts ?? 0);
  setValue("perfRWConflicts", metrics?.read_write_conflicts ?? 0);
  setValue("perfSharedReads", metrics?.shared_reads ?? 0);

  const finished = frame?.cores?.every(
    (core) => core.halted || core.next == null,
  );
  setValue(
    "perfStatus",
    !frame
      ? "Ready"
      : !metrics
        ? "Metrics unavailable"
        : finished
          ? "Completed"
          : timer
            ? "Running"
            : cursor === 0
              ? "Ready"
              : "Paused",
  );

  for (let i = 0; i < 2; i++) {
    const core = metrics?.cores?.[i];
    const state = frame?.cores?.[i];
    const utilization = core?.utilization ?? 0;
    setValue(`core${i}Util`, utilization.toFixed(1) + "%");
    setValue(`core${i}Instructions`, core?.instructions ?? 0);
    setValue(`core${i}Active`, core?.active_cycles ?? 0);
    setValue(`core${i}Idle`, core?.idle_cycles ?? 0);
    setValue(`core${i}Instruction`, core?.last_instruction ?? "\u2014");
    const coreStatus = !state
      ? "Ready"
      : state.halted
        ? "Halted"
        : state.next == null
          ? "Idle / Finished"
          : timer
            ? "Running"
            : cursor === 0
              ? "Ready"
              : "Paused";
    setValue(`core${i}Status`, coreStatus);
    const bar = $(`core${i}Bar`);
    if (bar) bar.style.width = utilization + "%";
  }

  updateInstructionDistribution(metrics);
  // Only display committed clocks, never future precomputed frames.
  drawPerformanceGraph(frames.slice(1, position + 1));
}

function updateInstructionDistribution(metrics) {
  const container = $("perfDistribution");
  if (!container) return;
  container.replaceChildren();
  const total = metrics?.instructions ?? 0;
  const categories = [
    ["Arithmetic", "arithmetic", "#62e4c0"],
    ["Logical", "logical", "#60a5fa"],
    ["Shift", "shift", "#a78bfa"],
    ["Memory", "memory", "#ffc879"],
    ["HALT", "halt", "#91a8bd"],
  ];
  for (const [label, key, color] of categories) {
    const count = metrics?.categories?.[key] ?? 0;
    const percent = total ? (count / total) * 100 : 0;
    const row = element("div", "", "perf-distribution-row");
    const name = element("span", label);
    const track = element("div", "", "perf-distribution-track");
    const fill = element("div", "", "perf-distribution-fill");
    fill.style.width = percent + "%";
    fill.style.backgroundColor = color;
    const value = element(
      "span",
      `${count} (${percent.toFixed(0)}%)`,
      "perf-distribution-value",
    );
    track.append(fill);
    row.append(name, track, value);
    container.append(row);
  }
}

function drawPerformanceGraph(history) {
  const graph = $("perfGraph");
  if (!graph) return;
  graph.replaceChildren();
  const namespace = "http://www.w3.org/2000/svg";
  const left = 55,
    right = 775,
    top = 15,
    bottom = 180;
  function add(tag, attributes, content) {
    const node = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes))
      node.setAttribute(key, value);
    if (content !== undefined) node.textContent = content;
    graph.append(node);
    return node;
  }
  const y = (value) => bottom - (value / 100) * (bottom - top);
  for (const percentage of [0, 25, 50, 75, 100]) {
    const height = y(percentage);
    add("line", {
      x1: left,
      y1: height,
      x2: right,
      y2: height,
      stroke: "#2b4055",
      "stroke-width": 1,
    });
    add(
      "text",
      {
        x: left - 10,
        y: height + 4,
        fill: "#91a8bd",
        "font-size": 12,
        "text-anchor": "end",
      },
      percentage + "%",
    );
  }
  if (!history.length) {
    add(
      "text",
      {
        x: 415,
        y: 100,
        fill: "#91a8bd",
        "font-size": 14,
        "text-anchor": "middle",
      },
      "Run the simulator to collect performance data.",
    );
    return;
  }
  const recent = history.slice(-30);
  const x = (index) =>
    recent.length === 1
      ? (left + right) / 2
      : left + (index / (recent.length - 1)) * (right - left);
  const values = recent.map((item) => {
    const active = new Set(item.events.map((event) => event.core));
    return {
      clock: item.clock,
      cpu: (active.size / item.cores.length) * 100,
      core0: active.has(0) ? 100 : 0,
      core1: active.has(1) ? 100 : 0,
    };
  });
  const interval = Math.max(1, Math.ceil(values.length / 8));
  values.forEach((value, index) => {
    if (index % interval !== 0 && index !== values.length - 1) return;
    add(
      "text",
      {
        x: x(index),
        y: bottom + 22,
        fill: "#91a8bd",
        "font-size": 12,
        "text-anchor": "middle",
      },
      "T" + value.clock,
    );
  });
  const series = [
    ["core0", "#62e4c0", "7 4"],
    ["core1", "#60a5fa", "2 4"],
    ["cpu", "#ffc879", ""],
  ];
  for (const [key, color, dash] of series) {
    const points = values
      .map((value, index) => `${x(index)},${y(value[key])}`)
      .join(" ");
    add("polyline", {
      points,
      fill: "none",
      stroke: color,
      "stroke-width": 2.5,
      "stroke-linejoin": "round",
      "stroke-dasharray": dash,
    });
    values.forEach((value, index) => {
      const point = add("circle", {
        cx: x(index),
        cy: y(value[key]),
        r: 3,
        fill: color,
      });
      const tooltip = document.createElementNS(namespace, "title");
      tooltip.textContent = `Clock ${value.clock}: ${key} ${value[key]}%`;
      point.append(tooltip);
    });
  }
}

// Advanced memory analyzer: derive everything from committed CPU frames.
function analyzeMemory(history, position) {
  const addresses = Array.from({ length: 256 }, (_, address) => ({
    address,
    reads: 0,
    writes: 0,
  }));
  const cores = Array.from({ length: 2 }, () => ({ reads: 0, writes: 0 }));
  const cycles = [],
    conflicts = [];
  for (let i = 1; i <= position && i < history.length; i++) {
    const before = history[i - 1],
      after = history[i];
    const accesses = after.events
      .filter((e) => e.read || e.store)
      .map((e) => {
        const address = e.word & 255,
          register = (e.word >> 9) & 7;
        const kind = e.read ? "reads" : "writes";
        addresses[address][kind]++;
        cores[e.core][kind]++;
        return {
          core: e.core,
          address,
          kind,
          value: e.read
            ? before.memory[address]
            : before.cores[e.core].registers[register],
        };
      });
    if (accesses.length) cycles.push({ clock: after.clock, accesses });
    for (const address of new Set(accesses.map((a) => a.address))) {
      const group = accesses.filter((a) => a.address === address);
      if (group.length < 2) continue;
      const writes = group.filter((a) => a.kind === "writes");
      const reads = group.filter((a) => a.kind === "reads");
      let type, explanation;
      if (writes.length === 2) {
        type = "Write conflict";
        explanation = `Core 0 writes 0x${hex(writes.find((a) => a.core === 0).value)}; Core 1 writes 0x${hex(writes.find((a) => a.core === 1).value)}. Core 1 wins: committed 0x${hex(after.memory[address])}.`;
      } else if (writes.length && reads.length) {
        type = "Read/write conflict";
        explanation = `Core ${reads[0].core} reads old value 0x${hex(reads[0].value)}; Core ${writes[0].core} commits 0x${hex(after.memory[address])} at clock end.`;
      } else {
        type = "Shared read";
        explanation = `Both cores read snapshot value 0x${hex(before.memory[address])}. No write occurs.`;
      }
      conflicts.push({ clock: after.clock, address, type, explanation });
    }
  }
  return { addresses, cores, cycles, conflicts };
}

function setupMemoryAnalyzer() {
  if ($("advancedMemory")) return;
  const panel = element("section", "", "panel performance-panel");
  panel.id = "advancedMemory";
  panel.innerHTML = `
    <div class="performance-heading"><div><h2>Advanced Memory Analyzer</h2><p>Shared memory \u00b7 256 bytes \u00b7 committed clocks only</p></div><span id="memUsedCount" class="perf-status">0 / 256 used</span></div>
    <div class="perf-card"><h3>Memory heatmap</h3><p>Every cell represents one byte address. Select an address for its access counts and current value.</p>
      <div class="ma-toolbar"><label for="memHeatMode">Heatmap metric</label><select id="memHeatMode"><option value="total">All accesses</option><option value="reads">Reads</option><option value="writes">Writes</option></select></div>
      <div class="ma-heat-scroll"><div id="memHeatGrid" class="ma-heat" aria-label="Memory addresses"></div></div>
      <p id="memHeatLegend"></p><div id="memSelected" class="ma-selected" aria-live="polite"></div></div>
    <div class="perf-core-grid"><div class="perf-card"><h3>Per-core memory activity</h3><div id="memCoreStats"></div></div><div class="perf-card"><h3>Most accessed addresses</h3><div id="memTop"></div></div></div>
    <div class="perf-card"><h3>Memory access timeline</h3><p>Most recent 30 clocks containing memory operations. Values are hexadecimal.</p><div id="memTimeline" class="ma-scroll"></div></div>
    <div class="perf-card"><h3>Memory interaction history</h3><p>Same-address operations in the same clock. Shared reads are not conflicts.</p><div id="memConflicts" class="ma-scroll"></div></div>
    <p class="perf-note">Reads use the start-of-clock snapshot. Stores commit in Core 0 then Core 1 order. These interactions do not introduce stalls in this architecture.</p>`;
  document.querySelector("main").append(panel);
  const style = element(
    "style",
    `
    .ma-toolbar{display:flex;align-items:center;gap:12px;margin:12px 0}.ma-toolbar select{width:auto;max-width:100%}.ma-toolbar label{margin:0}
    .ma-heat-scroll{overflow-x:auto}.ma-heat{display:grid;grid-template-columns:repeat(16,minmax(30px,1fr));gap:4px;min-width:550px}
    .ma-cell{padding:7px 2px;font:12px Consolas,monospace;text-align:center;border:1px solid #2b435b;border-radius:4px;color:#ebf4fb;min-width:0}
    .ma-cell[aria-pressed=true]{outline:2px solid #ffc879;outline-offset:-2px}.ma-selected{padding:12px;background:#16263a;border-radius:6px;font:13px/1.6 Consolas,monospace;overflow-wrap:anywhere}
    .ma-scroll{overflow:auto;max-height:360px}.ma-table{width:100%;border-collapse:collapse;font:13px/1.5 Consolas,monospace;text-align:left}.ma-table th,.ma-table td{padding:8px;border-bottom:1px solid #2b435b;vertical-align:top}.ma-table th{color:#aec3d6}.ma-entry{padding:10px 0;border-bottom:1px solid #2b435b}.ma-entry strong{color:#ffc879}.ma-entry p{margin:4px 0}.ma-empty{color:#aec3d6;font-size:13px;padding:10px 0}
  `,
  );
  document.head.append(style);
  panel.dataset.selected = "0";
  $("memHeatMode").onchange = () =>
    updateMemoryAnalyzer(
      frames[Math.floor(cursor / stages.length)],
      Math.floor(cursor / stages.length),
    );
  for (let address = 0; address < 256; address++) {
    const cell = element("button", hex(address), "ma-cell");
    cell.type = "button";
    cell.onclick = () => {
      panel.dataset.selected = String(address);
      updateMemoryAnalyzer(
        frames[Math.floor(cursor / stages.length)],
        Math.floor(cursor / stages.length),
      );
    };
    $("memHeatGrid").append(cell);
  }
}

function updateMemoryAnalyzer(frame, position) {
  setupMemoryAnalyzer();
  const data = analyzeMemory(frames, position);
  const total = (a) => a.reads + a.writes;
  const used = data.addresses.filter((a) => total(a) > 0);
  $("memUsedCount").textContent = `${used.length} / 256 used`;
  const mode = $("memHeatMode").value;
  const count = (a) => (mode === "total" ? total(a) : a[mode]);
  const max = Math.max(0, ...data.addresses.map(count));
  const selected = Number($("advancedMemory").dataset.selected);
  data.addresses.forEach((a, i) => {
    const cell = $("memHeatGrid").children[i];
    const intensity = max ? count(a) / max : 0;
    const color =
      mode === "writes"
        ? "255, 200, 121"
        : mode === "reads"
          ? "96, 165, 250"
          : "98, 228, 192";
    cell.style.background = `rgba(${color}, ${intensity ? 0.12 + 0.55 * intensity : 0.035})`;
    cell.style.color = intensity > 0.65 ? "#07131e" : "#ebf4fb";
    cell.title = `0x${hex(i)}: ${a.reads} reads, ${a.writes} writes`;
    cell.setAttribute("aria-label", cell.title);
    cell.setAttribute("aria-pressed", String(i === selected));
  });
  $("memHeatLegend").textContent =
    `Intensity: 0 to ${max} ${mode === "total" ? "accesses" : mode} per address \u00b7 relative to this run`;
  const a = data.addresses[selected];
  $("memSelected").textContent =
    `Address 0x${hex(selected)} (${selected}) \u00b7 Value ${frame ? "0x" + hex(frame.memory[selected]) : "\u2014"} \u00b7 Reads ${a.reads} \u00b7 Writes ${a.writes} \u00b7 Total ${total(a)}`;
  function table(id, headers, rows, empty) {
    const target = $(id);
    target.replaceChildren();
    if (!rows.length) {
      target.append(element("p", empty, "ma-empty"));
      return;
    }
    const t = element("table", "", "ma-table"),
      head = document.createElement("thead"),
      body = document.createElement("tbody");
    const hr = document.createElement("tr");
    headers.forEach((h) => hr.append(element("th", h)));
    head.append(hr);
    for (const row of rows) {
      const tr = document.createElement("tr");
      row.forEach((v) => tr.append(element("td", String(v))));
      body.append(tr);
    }
    t.append(head, body);
    target.append(t);
  }
  table(
    "memCoreStats",
    ["Core", "Reads", "Writes", "Total"],
    data.cores.map((c, i) => [`Core ${i}`, c.reads, c.writes, total(c)]),
    "No activity yet.",
  );
  table(
    "memTop",
    ["Address", "Reads", "Writes", "Total"],
    used
      .sort((a, b) => total(b) - total(a) || a.address - b.address)
      .slice(0, 8)
      .map((a) => ["0x" + hex(a.address), a.reads, a.writes, total(a)]),
    "No memory accesses yet.",
  );
  table(
    "memTimeline",
    ["Clock", "Core 0", "Core 1"],
    data.cycles
      .slice(-30)
      .reverse()
      .map((c) => [
        c.clock,
        ...[0, 1].map(
          (i) =>
            c.accesses
              .filter((a) => a.core === i)
              .map(
                (a) =>
                  `${a.kind === "reads" ? "LOAD" : "STORE"} 0x${hex(a.address)} \u2192 0x${hex(a.value)}`,
              )
              .join(", ") || "\u2014",
        ),
      ]),
    "Run a program with LOAD or STORE.",
  );
  const log = $("memConflicts");
  log.replaceChildren();
  if (!data.conflicts.length)
    log.append(element("p", "No same-address interactions yet.", "ma-empty"));
  for (const c of data.conflicts.slice().reverse()) {
    const entry = element("div", "", "ma-entry");
    entry.append(
      element(
        "strong",
        `T${c.clock} \u00b7 0x${hex(c.address)} \u00b7 ${c.type}`,
      ),
      element("p", c.explanation),
    );
    log.append(entry);
  }
}

// Phase 4: benchmark lab. Uses real simulation API results, not timer estimates.
function benchmarkSources(jobs, split, workload) {
  const tasks = Array.from({ length: jobs }, (_, i) => {
    const address = "0x" + hex(i);
    const arithmetic = ["NOR R1, R0, R0", "SUB R2, R0, R1", "ADD R3, R2, R2"];
    const memory = [
      "NOR R1, R0, R0",
      `STORE R1, ${address}`,
      `LOAD R2, ${address}`,
      `LOAD R3, ${address}`,
    ];
    return workload === "memory"
      ? memory
      : workload === "mixed"
        ? [...arithmetic, `STORE R3, ${address}`, `LOAD R4, ${address}`]
        : arithmetic;
  });
  const join = (list) => list.flat().join("\n");
  const n0 = Math.round((jobs * split) / 100);
  return {
    single: [join(tasks), ""],
    dual: [join(tasks.slice(0, n0)), join(tasks.slice(n0))],
    n0,
    n1: jobs - n0,
  };
}
function benchmarkSummary(data, capacity) {
  const last = data.frames?.at(-1);
  if (!last || !last.performance)
    throw new Error("Performance data missing. Check website.py.");
  const m = last.performance;
  if (m.cycles <= 0 || m.instructions <= 0)
    throw new Error("Empty benchmark result.");
  return {
    cycles: m.cycles,
    instructions: m.instructions,
    ipc: m.instructions / m.cycles,
    cpi: m.cycles / m.instructions,
    utilization: (m.instructions / (capacity * m.cycles)) * 100,
    idle: capacity * m.cycles - m.instructions,
    reads: m.memory_reads,
    writes: m.memory_writes,
    memory: last.memory,
    cores: m.cores,
  };
}
function setupBenchmarkLab() {
  if ($("benchmarkLab")) return;
  const section = element("section", "", "panel performance-panel");
  section.id = "benchmarkLab";
  section.innerHTML = `
    <div class="performance-heading"><div><h2>CPU Benchmark Lab</h2><p>Compare real simulated execution with one active core versus two available cores.</p></div><span class="perf-status" id="benchStatus" role="status">Ready</span></div>
    <div class="perf-core-grid"><div class="perf-card"><h3>Workload settings</h3>
      <label for="benchType">Workload</label><select id="benchType"><option value="arithmetic">Arithmetic (3 instructions per job)</option><option value="memory">Memory-intensive (4 instructions per job)</option><option value="mixed">Mixed (5 instructions per job)</option></select>
      <label for="benchJobs">Independent jobs (1-100)</label><input id="benchJobs" type="number" min="1" max="100" step="1" value="20">
      <label for="benchSplit">Core 0 share: <output id="benchSplitValue">50%</output></label><input id="benchSplit" type="range" min="0" max="100" step="5" value="50">
      <p id="benchAllocation"></p><label for="benchFrequency">Hypothetical CPU clock frequency (MHz)</label><input id="benchFrequency" type="number" min="0.001" max="100000" step="any" value="1">
      <div class="actions"><button id="benchRun" class="primary" type="button">Run benchmark</button><button id="benchReset" type="button">Reset</button></div>
    </div><div class="perf-card"><h3>How this experiment works</h3><p>Each job performs the same fixed sequence of instructions using core-local scratch registers. Memory jobs use separate addresses, so the two cores do not compete for the same byte.</p><p>The baseline runs all jobs on Core 0 with an empty Core 1 program. The comparison distributes those same jobs across both cores. Programs stop at their end without HALT, so instruction counts are equal.</p><p>Utilization in the baseline is measured against one available execution slot per cycle; the comparison uses two. The underlying simulator still contains two cores in both runs.</p><p>Frequency changes only the estimated time, not simulated cycles or browser playback speed.</p></div></div>
    <div id="benchResults" hidden><div class="perf-grid" id="benchKPIs"></div><div class="perf-card bench-block"><h3>Cycle comparison</h3><div id="benchBars"></div></div><div class="perf-card bench-block"><h3>Detailed comparison</h3><div class="ma-scroll" id="benchTable"></div></div><div class="perf-card bench-block"><h3>Generated assembly</h3><details><summary>One active core</summary><pre id="benchSingleCode" class="bench-code"></pre></details><details><summary>Dual-core programs</summary><pre id="benchDualCode" class="bench-code"></pre></details></div><p class="perf-note" id="benchExplanation"></p></div>`;
  document.querySelector("main").append(section);
  document.head.append(
    element(
      "style",
      `.bench-block{margin-top:14px}.bench-code{white-space:pre-wrap;max-height:260px;overflow:auto;font:12px/1.5 Consolas,monospace;color:var(--text)}#benchmarkLab input[type=range]{accent-color:var(--mint)}.bench-bar{height:12px;border-radius:4px;background:#26394a;overflow:hidden;margin:8px 0 18px}.bench-bar>div{height:100%;border-radius:4px}.bench-bar-label{display:flex;justify-content:space-between;gap:10px;font-size:13px}`,
    ),
  );
  let generation = 0;
  const controls = ["benchType", "benchJobs", "benchSplit", "benchFrequency"];
  function settings() {
    const jobs = Number($("benchJobs").value),
      split = Number($("benchSplit").value),
      frequency = Number($("benchFrequency").value);
    if (!Number.isInteger(jobs) || jobs < 1 || jobs > 100)
      throw new Error("Enter 1 to 100 whole jobs.");
    if (!Number.isFinite(frequency) || frequency < 0.001 || frequency > 100000)
      throw new Error("Enter a frequency from 0.001 to 100000 MHz.");
    return { jobs, split, frequency, workload: $("benchType").value };
  }
  function allocation() {
    $("benchSplitValue").textContent = $("benchSplit").value + "%";
    const jobs = Number($("benchJobs").value),
      split = Number($("benchSplit").value);
    if (!Number.isInteger(jobs) || jobs < 1 || jobs > 100) {
      $("benchAllocation").textContent = "Enter a valid job count.";
      return;
    }
    const n = Math.round((jobs * split) / 100);
    $("benchAllocation").textContent =
      `Core 0: ${n} jobs | Core 1: ${jobs - n} jobs`;
  }
  function invalidateBenchmark() {
    generation++;
    $("benchRun").disabled = false;
    $("benchResults").hidden = true;
    $("benchStatus").textContent = "Ready";
    allocation();
  }
  controls.forEach((id) =>
    $(id).addEventListener("input", invalidateBenchmark),
  );
  $("benchReset").onclick = () => {
    $("benchJobs").value = 20;
    $("benchSplit").value = 50;
    $("benchFrequency").value = 1;
    $("benchType").value = "arithmetic";
    invalidateBenchmark();
  };
  async function execute(sources) {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Simulation failed.");
    return data;
  }
  $("benchRun").onclick = async () => {
    const token = ++generation;
    $("benchResults").hidden = true;
    $("benchRun").disabled = true;
    $("benchStatus").textContent = "Running...";
    try {
      const s = settings(),
        programs = benchmarkSources(s.jobs, s.split, s.workload);
      const [singleData, dualData] = await Promise.all([
        execute(programs.single),
        execute(programs.dual),
      ]);
      if (token !== generation) return;
      const a = benchmarkSummary(singleData, 1),
        b = benchmarkSummary(dualData, 2);
      const expected =
        s.jobs * { arithmetic: 3, memory: 4, mixed: 5 }[s.workload];
      if (
        a.instructions !== expected ||
        b.instructions !== expected ||
        a.memory.length !== b.memory.length ||
        a.memory.some((v, i) => v !== b.memory[i])
      )
        throw new Error("Workload verification failed: runs differ.");
      const speedup = a.cycles / b.cycles,
        efficiency = (speedup / 2) * 100;
      const saved = (1 - b.cycles / a.cycles) * 100;
      const ideal = (Math.ceil(s.jobs / 2) * expected) / s.jobs;
      const f = (v, n = 2) => v.toFixed(n);
      const time = (cycles) =>
        Number((cycles / s.frequency).toPrecision(6)).toString() + " us";
      const kpis = $("benchKPIs");
      kpis.replaceChildren();
      for (const [label, value] of [
        ["Speedup", f(speedup) + "x"],
        ["Parallel efficiency", f(efficiency, 1) + "%"],
        ["Cycles saved", f(saved, 1) + "%"],
        ["Baseline cycles", a.cycles],
        ["Dual-core cycles", b.cycles],
        ["Balanced-job target", ideal],
      ]) {
        const card = element("div", "", "perf-card");
        card.append(element("span", label), element("strong", String(value)));
        kpis.append(card);
      }
      const bars = $("benchBars");
      bars.replaceChildren();
      for (const [label, cycles, color] of [
        ["One active core", a.cycles, "#91a8bd"],
        ["Two available cores", b.cycles, "#62e4c0"],
        ["Balanced-job target", ideal, "#60a5fa"],
      ]) {
        const row = element("div", "", "bench-bar-label");
        row.append(
          element("span", label),
          element("b", String(cycles) + " cycles"),
        );
        const track = element("div", "", "bench-bar"),
          fill = element("div", "");
        fill.style.width =
          (cycles / Math.max(a.cycles, b.cycles, ideal)) * 100 + "%";
        fill.style.background = color;
        track.append(fill);
        bars.append(row, track);
      }
      const rows = [
        ["Executed instructions", a.instructions, b.instructions],
        ["Clock cycles", a.cycles, b.cycles],
        ["IPC", f(a.ipc), f(b.ipc)],
        ["Aggregate CPI", f(a.cpi, 4), f(b.cpi, 4)],
        [
          "Utilization (available slots)",
          f(a.utilization, 1) + "%",
          f(b.utilization, 1) + "%",
        ],
        ["Idle available slots", a.idle, b.idle],
        [
          "Core 0 instructions",
          a.cores[0].instructions,
          b.cores[0].instructions,
        ],
        [
          "Core 1 instructions",
          a.cores[1].instructions,
          b.cores[1].instructions,
        ],
        ["Memory reads", a.reads, b.reads],
        ["Memory writes", a.writes, b.writes],
        ["Estimated execution time", time(a.cycles), time(b.cycles)],
      ];
      const table = element("table", "", "ma-table"),
        head = document.createElement("thead"),
        body = document.createElement("tbody"),
        hr = document.createElement("tr");
      ["Metric", "One active core", "Two available cores"].forEach((v) =>
        hr.append(element("th", v)),
      );
      head.append(hr);
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((v) => tr.append(element("td", String(v))));
        body.append(tr);
      });
      table.append(head, body);
      $("benchTable").replaceChildren(table);
      $("benchSingleCode").textContent = programs.single[0];
      $("benchDualCode").textContent =
        "Core 0:\n" +
        (programs.dual[0] || "(empty)") +
        "\n\nCore 1:\n" +
        (programs.dual[1] || "(empty)");
      $("benchExplanation").textContent =
        `Verified equal instruction counts and identical final shared memory. ${programs.n0} jobs on Core 0, ${programs.n1} on Core 1. The balanced-job target assumes an even distribution of whole jobs. No pipeline, cache, or memory stall penalties are modeled.`;
      $("benchResults").hidden = false;
      $("benchStatus").textContent = "Completed";
    } catch (error) {
      if (token === generation) $("benchStatus").textContent = error.message;
    } finally {
      if (token === generation) $("benchRun").disabled = false;
    }
  };
  allocation();
}

render();
setupBenchmarkLab();
start();

// Phase 5: measured experiment sweeps, independent of simulator playback.
function experimentCases(mode, jobs, split) {
  if (mode === "balance")
    return Array.from({ length: 11 }, (_, i) => ({ jobs, split: i * 10 }));
  return [
    ...new Set([
      1,
      ...[0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(jobs * f))),
    ]),
  ]
    .sort((a, b) => a - b)
    .map((n) => ({ jobs: n, split }));
}
function experimentResult(a, b, c, workload, frequency) {
  const expected = c.jobs * { arithmetic: 3, memory: 4, mixed: 5 }[workload];
  if (
    a.instructions !== expected ||
    b.instructions !== expected ||
    a.reads !== b.reads ||
    a.writes !== b.writes ||
    a.memory.length !== b.memory.length ||
    a.memory.some((v, i) => v !== b.memory[i])
  )
    throw new Error("Equivalent workload verification failed.");
  const speedup = a.cycles / b.cycles,
    target = (Math.ceil(c.jobs / 2) * expected) / c.jobs;
  return {
    ...c,
    workload,
    frequency,
    n0: Math.round((c.jobs * c.split) / 100),
    single: a.cycles,
    dual: b.cycles,
    target,
    speedup,
    efficiency: (speedup / 2) * 100,
    utilization: b.utilization,
    idle: b.idle,
    instructions: expected,
    reads: b.reads,
    writes: b.writes,
    singleUs: a.cycles / frequency,
    dualUs: b.cycles / frequency,
  };
}
function setupExperiments() {
  const panel = element("section", "", "panel performance-panel");
  panel.id = "experimentLab";
  panel.innerHTML = `<div class="performance-heading"><div><h2>Interactive Performance Experiments</h2><p>Run systematic experiments against the actual CPU simulation API.</p></div><span id="expStatus" class="perf-status" role="status">Ready</span></div>
  <div class="perf-core-grid"><div class="perf-card"><h3>Experiment settings</h3><label for="expPreset">Experiment preset</label><select id="expPreset"><option value="balance">Load balancing sweep</option><option value="scale">Workload scaling sweep</option><option value="frequency">Frequency analysis</option></select><label for="expType">Workload</label><select id="expType"><option value="arithmetic">Arithmetic</option><option value="memory">Memory-intensive</option><option value="mixed">Mixed</option></select><label for="expJobs">Jobs (1-100; maximum for scaling)</label><input id="expJobs" type="number" min="1" max="100" value="20"><label for="expSplit">Core 0 share (%) - scaling and frequency only</label><input id="expSplit" type="number" min="0" max="100" value="50"><label for="expFreq">Reference frequency (MHz)</label><input id="expFreq" type="number" min="0.001" max="100000" step="any" value="1"><div class="actions"><button id="expRun" class="primary">Run experiment</button><button id="expCancel" disabled>Cancel</button><button id="expExport" disabled>Export CSV</button></div></div><div class="perf-card"><h3>Experiment method</h3><p>Load balancing varies the requested Core 0 share from 0 to 100%. Scaling varies whole-job counts up to the selected maximum. Each comparison runs identical jobs on one active core and two available cores.</p><p>Frequency analysis runs the processor once per configuration and converts its measured cycle counts into estimated times at five frequencies relative to the reference. Frequency does not alter cycles.</p><p>All jobs are independent; no cache, pipeline or memory stall penalties are modeled.</p></div></div>
  <div id="expResults" hidden><div class="perf-card"><h3 id="expTitle"></h3><svg id="expGraph" viewBox="0 0 800 300" role="img" aria-label="Experiment comparison graph" style="width:100%;height:auto"></svg><p id="expLegend"></p></div><div class="perf-card bench-block"><h3>Measured results</h3><div id="expTable" class="ma-scroll"></div></div><div class="perf-card bench-block"><h3>Performance insights</h3><p id="expInsight"></p></div></div>`;
  document.querySelector("main").append(panel);
  let generation = 0,
    rows = [],
    controller = null;
  const ids = ["expPreset", "expType", "expJobs", "expSplit", "expFreq"];
  function cancel(message = "Ready") {
    generation++;
    controller?.abort();
    controller = null;
    rows = [];
    $("expResults").hidden = true;
    $("expExport").disabled = true;
    $("expRun").disabled = false;
    $("expCancel").disabled = true;
    $("expStatus").textContent = message;
  }
  function controls() {
    const mode = $("expPreset").value;
    $("expSplit").disabled = mode === "balance";
  }
  ids.forEach((id) =>
    $(id).addEventListener("input", () => {
      cancel();
      controls();
    }),
  );
  controls();
  $("expCancel").onclick = () => cancel("Cancelled");
  async function execute(sources, signal, capacity) {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources }),
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Simulation failed");
    return benchmarkSummary(data, capacity);
  }
  function display(mode, results) {
    const frequency = mode === "frequency",
      balance = mode === "balance";
    $("expTitle").textContent = frequency
      ? "Estimated execution time vs frequency"
      : balance
        ? "Measured speedup vs requested Core 0 share"
        : "Measured cycles vs workload size";
    const graph = $("expGraph");
    graph.replaceChildren();
    const ns = "http://www.w3.org/2000/svg";
    function add(tag, attrs, label) {
      const n = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
      if (label !== undefined) n.textContent = label;
      graph.append(n);
      return n;
    }
    const series = balance
      ? [
          ["speedup", "#62e4c0", "Measured speedup"],
          ["idealSpeedup", "#60a5fa", "Balanced-job target"],
        ]
      : frequency
        ? [
            ["singleUs", "#91a8bd", "One active core"],
            ["dualUs", "#62e4c0", "Two available cores"],
          ]
        : [
            ["single", "#91a8bd", "One active core"],
            ["dual", "#62e4c0", "Two available cores"],
            ["target", "#60a5fa", "Balanced-job target"],
          ];
    const values = results.map((r) => ({
      ...r,
      idealSpeedup: r.single / r.target,
    }));
    const max = Math.max(...values.flatMap((r) => series.map(([k]) => r[k])));
    const top = 20,
      bottom = 250,
      left = 80,
      right = 770;
    const domain = values.map((r) =>
        balance ? r.split : frequency ? Math.log10(r.frequency) : r.jobs,
      ),
      minX = Math.min(...domain),
      maxX = Math.max(...domain);
    const x = (i) =>
      minX === maxX
        ? (left + right) / 2
        : left + ((domain[i] - minX) / (maxX - minX)) * (right - left);
    const y = (v) => bottom - (v / max) * (bottom - top);
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4;
      add("line", {
        x1: left,
        y1: y(v),
        x2: right,
        y2: y(v),
        stroke: "#2b435b",
      });
      add(
        "text",
        {
          x: left - 8,
          y: y(v) + 4,
          fill: "#aec3d6",
          "font-size": 11,
          "text-anchor": "end",
        },
        Number(v.toPrecision(4)) + (balance ? "x" : frequency ? " us" : ""),
      );
    }
    values.forEach((r, i) =>
      add(
        "text",
        {
          x: x(i),
          y: 270,
          fill: "#aec3d6",
          "font-size": 10,
          "text-anchor": "middle",
        },
        balance
          ? r.split + "%"
          : frequency
            ? Number(r.frequency.toPrecision(4)) + " MHz"
            : r.jobs,
      ),
    );
    series.forEach(([key, color]) => {
      add("polyline", {
        points: values.map((r, i) => `${x(i)},${y(r[key])}`).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 2.5,
      });
      values.forEach((r, i) => {
        const dot = add("circle", {
          cx: x(i),
          cy: y(r[key]),
          r: 4,
          fill: color,
        });
        const title = document.createElementNS(ns, "title");
        title.textContent = key + ": " + r[key];
        dot.append(title);
      });
    });
    $("expLegend").textContent =
      series
        .map(
          ([, c, label]) =>
            label +
            " (" +
            { "#62e4c0": "mint", "#60a5fa": "blue", "#91a8bd": "gray" }[c] +
            ")",
        )
        .join(" | ") +
      (frequency ? " | Logarithmic frequency axis; calculated time" : "");
    const headers = [
      "Jobs",
      "Core 0 share",
      "Core 0 jobs",
      "Core 1 jobs",
      "MHz",
      "Baseline cycles",
      "Dual cycles",
      "Target cycles",
      "Speedup",
      "Efficiency",
      "Idle slots",
      "Baseline us",
      "Dual us",
    ];
    const table = element("table", "", "ma-table"),
      head = document.createElement("thead"),
      body = document.createElement("tbody"),
      hr = document.createElement("tr");
    headers.forEach((h) => hr.append(element("th", h)));
    head.append(hr);
    results.forEach((r) => {
      const tr = document.createElement("tr");
      [
        r.jobs,
        r.split + "%",
        r.n0,
        r.jobs - r.n0,
        r.frequency,
        r.single,
        r.dual,
        r.target,
        r.speedup.toFixed(3),
        r.efficiency.toFixed(1) + "%",
        r.idle,
        Number(r.singleUs.toPrecision(6)),
        Number(r.dualUs.toPrecision(6)),
      ].forEach((v) => tr.append(element("td", String(v))));
      body.append(tr);
    });
    table.append(head, body);
    $("expTable").replaceChildren(table);
    const best = results.reduce((a, b) => (b.speedup > a.speedup ? b : a));
    const ties = results.filter((r) => r.speedup === best.speedup);
    $("expInsight").textContent = frequency
      ? `Measured cycle counts remain ${best.single} and ${best.dual}. Increasing frequency reduces estimated time proportionally without changing speedup (${best.speedup.toFixed(2)}x). These times are hypothetical, not hardware measurements.`
      : balance
        ? `Best measured speedup: ${best.speedup.toFixed(2)}x at requested share(s) ${ties.map((r) => r.split + "%").join(", ")}. The best measured run uses ${best.dual} cycles versus ${best.target} for balanced whole jobs. Uneven allocations leave execution slots idle; rounding to whole jobs can create ties.`
        : `Across ${results.length} workload sizes, measured speedup ranges from ${Math.min(...results.map((r) => r.speedup)).toFixed(2)}x to ${best.speedup.toFixed(2)}x. Whole-job rounding can affect utilization for small workloads. All comparisons verified equal instruction counts and final shared memory.`;
    $("expResults").hidden = false;
  }
  $("expRun").onclick = async () => {
    cancel();
    const token = generation;
    controller = new AbortController();
    const signal = controller.signal;
    $("expRun").disabled = true;
    $("expCancel").disabled = false;
    try {
      const mode = $("expPreset").value,
        workload = $("expType").value,
        jobs = Number($("expJobs").value),
        split = Number($("expSplit").value),
        frequency = Number($("expFreq").value);
      if (
        !Number.isInteger(jobs) ||
        jobs < 1 ||
        jobs > 100 ||
        !Number.isInteger(split) ||
        split < 0 ||
        split > 100 ||
        !Number.isFinite(frequency) ||
        frequency < 0.001 ||
        frequency > 100000
      )
        throw new Error("Enter valid jobs, share and frequency.");
      const cases =
          mode === "frequency"
            ? [{ jobs, split }]
            : experimentCases(mode, jobs, split),
        baseline = new Map(),
        results = [];
      for (let i = 0; i < cases.length; i++) {
        if (token !== generation) return;
        const c = cases[i],
          p = benchmarkSources(c.jobs, c.split, workload);
        $("expStatus").textContent = `Running ${i + 1} / ${cases.length}`;
        if (!baseline.has(c.jobs))
          baseline.set(c.jobs, await execute(p.single, signal, 1));
        if (token !== generation) return;
        const b = await execute(p.dual, signal, 2);
        if (token !== generation) return;
        results.push(
          experimentResult(baseline.get(c.jobs), b, c, workload, frequency),
        );
      }
      if (mode === "frequency") {
        const r = results[0];
        rows = [0.25, 0.5, 1, 2, 4].map((f) => ({
          ...r,
          frequency: frequency * f,
          singleUs: r.single / (frequency * f),
          dualUs: r.dual / (frequency * f),
        }));
      } else rows = results;
      display(mode, rows);
      $("expExport").disabled = false;
      $("expStatus").textContent = "Completed";
    } catch (error) {
      if (token === generation) $("expStatus").textContent = error.message;
    } finally {
      if (token === generation) {
        controller = null;
        $("expRun").disabled = false;
        $("expCancel").disabled = true;
      }
    }
  };
  $("expExport").onclick = () => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => r[k]).join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "coretrace-experiment.csv";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
setupExperiments();
