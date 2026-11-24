const $ = id => document.getElementById(id);
const hex = (value, width = 2) => value.toString(16).toUpperCase().padStart(width, "0");
const canvas = $("diagram");
const ctx = canvas.getContext("2d");
const stageDuration = 1150;
let animation = null, progress = 0, stageStarted;
let config, frames = [], cursor = 0, timer = null, mode = "instruction", requestId = 0;

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
    const fill = active ? "#193a3c" : "#172638";
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
        polygon([[0, 0], [w, 10], [w, 36], [0, h], [0, 29], [13, 23], [0, 17]]);
        break;
      case "mux":
        polygon([[0, 12], [30, 0], [w, 0], [w, h], [30, h], [0, h - 12]]);
        break;
      case "decoder":
        polygon([[0, 0], [w - 15, 0], [w, 13], [w, 33], [w - 15, h], [0, h]]);
        break;
      case "control":
        polygon([[12, 0], [w - 12, 0], [w, 10], [w, 36], [w - 12, h], [12, h], [0, 36], [0, 10]]);
        break;
      case "pc":
        polygon([[0, 0], [w, 0], [w, h], [0, h], [0, 31], [9, 24], [0, 17]]);
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
        polygon([[0, 0], [w, 0], [w, h], [0, h]]);
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
    const color = active ? (control ? colors.control : colors.data) : colors.idle;
    ctx.strokeStyle = color;
    ctx.lineWidth = active ? 2.7 : 1.2;
    ctx.setLineDash(control ? [5, 4] : []);
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    ctx.setLineDash([]);
    const [x, y] = points.at(-1), [px, py] = points.at(-2);
    const angle = Math.atan2(y - py, x - px);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (const offset of [-0.55, 0.55]) {
      ctx.lineTo(x - 8 * Math.cos(angle + offset), y - 8 * Math.sin(angle + offset));
    }
    ctx.fill();
    if (!active || progress < delay) return;
    const segments = points.slice(1).map(([endX, endY], i) => {
      const [startX, startY] = points[i];
      return {startX, startY, dx: endX - startX, dy: endY - startY,
        length: Math.hypot(endX - startX, endY - startY)};
    });
    const length = segments.reduce((sum, segment) => sum + segment.length, 0);
    let distance = Math.min(1, (progress - delay) / (1 - delay)) * length;
    for (const segment of segments) {
      if (distance > segment.length) {
        distance -= segment.length;
        continue;
      }
      const fraction = distance / segment.length;
      const dotX = segment.startX + segment.dx * fraction;
      const dotY = segment.startY + segment.dy * fraction;
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
  for (const [index, left] of [[0, 25], [1, 550]]) {
    const core = frame?.cores[index];
    const event = eventFrame?.events.find(item => item.core === index);
    const instruction = event?.source.split(/[ ,]/)[0].toUpperCase();
    const fetch = Boolean(event && phase === 1);
    const decoding = Boolean(event && phase === 2);
    const executing = Boolean(event && phase === 3);
    const commit = Boolean(event && phase === 0);
    const read = executing && event.read, store = (executing || commit) && event.store;
    const alu = executing && event.alu, write = commit && event.write;
    const address = event ? hex(event.word & 255) : "";
    const path = (points, active, control, delay) =>
      wire(points.map(([x, y]) => [left + x, y]), active, control, delay);
    const unit = (x, ...args) => block(left + x, ...args);

    text(left + 235, 18, "CORE " + index + (instruction ? "  /  " + instruction : ""),
      event ? colors.data : "#aec7d9", 17);
    path([[107, 63], [151, 63]], fetch);
    path([[275, 63], [328, 63]], fetch, false, 0.42);
    path([[389, 86], [389, 111]], decoding, true);
    path([[328, 125], [72, 125], [72, 86]], commit, true);
    path([[328, 75], [294, 75], [294, 151], [103, 151], [103, 172]], decoding && (event.alu || event.store || event.write));
    path([[450, 63], [473, 63], [473, 197], [447, 197]], read || store);
    path([[350, 157], [350, 165], [230, 165], [230, 180]], alu, true);
    path([[433, 157], [433, 180]], read || store, true);
    path([[450, 132], [461, 132], [461, 269], [380, 269], [380, 279]], write, true);
    path([[156, 194], [181, 194]], alu, false, 0.25);
    path([[156, 212], [181, 212]], alu, false, 0.25);
    path([[134, 226], [134, 247], [360, 247], [360, 226]], store);
    path([[275, 203], [287, 203], [287, 263], [269, 263], [269, 279]], write && event.alu);
    path([[392, 226], [392, 255], [339, 255], [339, 279]], write && event.read);
    path([[230, 303], [79, 303], [79, 226]], write, false, 0.42);

    const port = index === 0 ? 175 : 870;
    path([[409, 226], [409, 345], [port - left, 345], [port - left, 372]], store, false, 0.42);
    path([[port + 22 - left, 372], [port + 22 - left, 355], [428, 355], [428, 226]], read);
    if (read || store) {
      const value = (read ? eventFrame.cores[index] : core).registers[(event.word >> 9) & 7];
      memoryOps.push("C" + index + (read ? " reads snapshot " : commit ? " commits " : " buffers ") + "M[" + address + "] = " + hex(value));
    }

    unit(13, 40, 94, "PC / +1", core ? hex(core.pc, 4) : "—", fetch || commit, "pc");
    unit(151, 40, 124, "Instruction ROM", event ? "PC " + hex(event.pc, 4) : "16-bit words", fetch, "rom");
    unit(328, 40, 122, "Decoder", event ? "IR " + hex(event.word, 4) : "opcode / fields", decoding, "decoder");
    unit(328, 111, 122, "Control unit", event?.halt ? "HALT · hold PC" : event ? instruction : "idle", decoding || Boolean(commit && event.halt), "control");
    unit(26, 180, 130, "Register file", "R0–R7 × 8 bits", alu || write || store, "registers");
    unit(181, 180, 94, "ALU", alu ? instruction : "8-bit", alu || Boolean(write && event.alu), "alu");
    unit(332, 180, 115, "Memory I/O", read || store ? "0x" + address : "8-bit bus", read || store);
    unit(230, 279, 150, "Writeback MUX", write ? (event.read ? "memory → Rd" : "ALU → Rd") : "idle", write, "mux");
  }
  block(155, 366, 750, "Shared data memory · 256 × 8 bits",
    memoryOps.join("    |    ") || "Read start-of-clock snapshot · commit stores at clock end", memoryOps.length, "memory");
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function render() {
  const position = Math.floor(cursor / stages.length), phase = cursor % stages.length;
  const frame = frames[position], previous = phase === 0 ? frames[position - 1] : null;
  const eventFrame = frames[position + Number(phase !== 0)];
  drawCircuit();
  $("clock").textContent = "CLOCK " + String(eventFrame?.clock ?? 0).padStart(2, "0");
  $("stage").textContent = cursor ? stages[phase] : "Ready";
  $("run").disabled = !lastCursor() || Boolean(timer);
  $("reset").disabled = !frame;
  $("pause").disabled = !timer;
  for (const id of ["registers", "memory", "trace"]) $(id).replaceChildren();
  if (!frame) return;

  frame.cores.forEach((core, index) => {
    const state = core.halted ? "HALTED" : core.next ? "NEXT L" + core.next : "END";
    $("registers").append(element("div", "C" + index + "  ·  PC " + hex(core.pc, 4) + "  ·  " + state, "core-label"));
    const row = element("div", "", "reggrid");
    core.registers.forEach((value, reg) => {
      row.append(element("span", "R" + reg + " " + hex(value),
        previous && previous.cores[index].registers[reg] !== value ? "changed" : ""));
    });
    $("registers").append(row);
  });

  const memoryEvents = phase === 3 || phase === 0 ? eventFrame.events : [];
  const addresses = new Set(memoryEvents.filter(e => e.read || e.store).map(e => e.word & 255));
  for (let offset = 0; offset < 256; offset += 16) {
    const row = element("div", "", "memrow");
    row.append(element("span", hex(offset), "addr"));
    frame.memory.slice(offset, offset + 16).forEach((value, index) => {
      const address = offset + index;
      const cell = element("span", hex(value), addresses.has(address) ? "byte used" : "byte");
      cell.title = "Address 0x" + hex(address);
      row.append(cell);
    });
    $("memory").append(row);
  }
  if (addresses.size) $("memory").scrollTop = Math.floor([...addresses][0] / 16) * $("memory").firstChild.offsetHeight;

  const history = frames.slice(Math.max(1, position - 9), position + 1).reverse();
  for (const item of history) {
    for (const event of item.events) {
      const row = element("div", "", "event");
      row.append(element("strong", "T" + item.clock + "  C" + event.core + "  "), element("span", hex(event.word, 4) + "  "),
        document.createTextNode(event.source), document.createElement("br"), element("span", event.effect));
      $("trace").append(row);
    }
  }
  if (phase) {
    const descriptions = [
      "", "Fetch the encoded word from instruction ROM.",
      "Decode the opcode and select the control signals.",
      "Use the ALU, read memory, or buffer a store as required. Register and memory changes appear at commit.",
    ];
    const heading = eventFrame.events.map(event => "C" + event.core + " " + event.source).join(" · ");
    $("trace").prepend(element("div", stages[phase] + " · " + heading, "event"),
      element("div", descriptions[phase], "core-label"));
  } else if (!position) {
    $("trace").append(element("div", "Press Run to watch the instruction flow through the circuit.", "core-label"));
  }
}

function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function drawCircuit() {
  const phase = cursor % stages.length;
  const position = Math.floor(cursor / stages.length);
  diagram(frames[position], frames[position + Number(phase !== 0)], phase, progress);
}

function pause() {
  timer = null;
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
}

function animate(now) {
  if (stageStarted === undefined) stageStarted = now - progress * stageDuration;
  progress = Math.min(1, (now - stageStarted) / stageDuration);
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
    stageStarted = now;
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
  stageStarted = undefined;
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
  const payload = {sources};
  if (mode === "instruction") {
    sources.fill("");
    sources[Number($("target").value)] = $("command").value;
    payload.seed = ["r1", "r2", "sample"].map(id => $(id).value);
  }
  status("Assembling…");
  try {
    const response = await fetch("/api/simulate", {method: "POST",
      headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (request !== requestId) return;
    frames = data.frames;
    status(autoPlay ? "Playing instruction." : lastCursor() ? "Assembled. Press Run to play." : "No instructions to run.");
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
  const operands = {LOAD: " R3, 0x20", STORE: " R1, 0x20", HALT: ""};
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
$("pause").onclick = () => { pause(); render(); };
$("command").onkeydown = event => { if (event.key === "Enter") load(true); };
for (const id of ["command", "target", "r1", "r2", "sample", "source0", "source1"]) $(id).oninput = invalidate;
new ResizeObserver(drawCircuit).observe(canvas);

async function start() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Could not load the CPU configuration.");
    config = await response.json();
    $("opcode").replaceChildren(...config.opcodes.map(name => new Option(name, name)));
    [$("source0").value, $("source1").value] = config.demo;
    fillCommand();
    await load();
  } catch (error) {
    status(error.message, true);
  }
}
render();
start();
