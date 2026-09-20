(() => {
  const tools = /*__TOOLS__*/ [];
  const components = {
    ask: [
      "You ask the cat",
      "Chat and the desktop bubble send the same kind of text request. Talk uses local Whisper first; you review the transcript before sending it.",
      "src/renderer/src/App.tsx\nsrc/renderer/src/voice/PetVoice.tsx\nsrc/preload/index.ts",
      "Change this layer for a better way to ask, review or display a reply.",
    ],
    agent: [
      "The agent chooses what it needs",
      "Pi runs the conversation loop with the selected model. The model can answer directly or request tools, inspect their results, and continue. Tool use is chosen during the reply.",
      "src/agent/pi-runtime.ts\nsrc/agent/runtime.ts\nsrc/agent/desktop-tools.ts",
      "Improve the prompt or tool descriptions when the cat chooses an unhelpful path.",
    ],
    broker: [
      "A scoped route to the desktop",
      "Desktop tool requests cross a private worker channel into main. The broker validates the request, checks the active turn and any source, and supervises one OS operation at a time, including utilities.",
      "src/agent/desktop-rpc.ts\nsrc/main/worker-runtime.ts\nsrc/main/desktop/controller.ts",
      "Add validation, cancellation and error handling here when extending desktop capabilities.",
    ],
    desktop: [
      "Desktop evidence and everyday actions",
      "Observation reads one window through accessibility and scoped capture. Utilities get time/folder paths, read or write requested clipboard text, and open links or file locations. Actions report OS dispatch; a fresh observation checks the visible result.",
      "src/main/desktop/electron-provider.ts\nsrc/main/desktop/windows-reader.ts\nsrc/main/desktop/source-capture.ts\nsrc/main/desktop/utilities.ts",
      "Improve this layer for clearer text, better app targeting or more reliable screenshots.",
    ],
    files: [
      "Another branch: files and commands",
      "Built-in Pi tools work from the Desktop folder with the current user’s OS permissions. They can read or change files and execute commands. They do not pass through the desktop observation broker.",
      "src/agent/pi-runtime.ts\nsrc/shared/tools.ts",
      "Treat command and file capabilities separately from read-only desktop observations.",
    ],
    memory: [
      "Context across replies",
      "Main saves the visible transcript. Pi’s native session retains model context, including tool results and images. The worker restores that session when a conversation resumes. This storage serves the whole conversation, not just desktop tools.",
      "src/main/conversation-store.ts\nsrc/main/chat-controller.ts\nsrc/agent/pi-runtime.ts",
      "Change retention and restore behavior here. Repository developer memory is separate.",
    ],
  };
  const examples = {
    page: {
      nodes: ["ask", "agent", "broker", "desktop"],
      steps: [
        ["Ask about this page", "The agent needs fresh context about the app you mean."],
        ["Observe the app", "Get its identity, readable text and an image.", "desktop_observe"],
        ["Answer from evidence", "Explain the page, or take a focused follow-up look if needed."],
      ],
      note: "If the cat has focus, the app behind it is a starting point. A named app may need a window listing first.",
    },
    selection: {
      nodes: ["ask", "agent", "broker", "desktop"],
      steps: [
        ["Ask about your highlight", "Use the selection already made in the other app."],
        [
          "Read only selected text",
          "No screenshot or full-page text is collected.",
          "desktop_read_selection",
        ],
        [
          "Summarize or rewrite",
          "Work with the returned text without changing the app’s selection.",
        ],
      ],
      note: "An app may not expose selected text. An empty result is a limitation of the evidence, not proof of an empty selection.",
    },
    detail: {
      nodes: ["ask", "agent", "broker", "desktop"],
      steps: [
        [
          "See the whole source",
          "Locate the small error within a fresh observation.",
          "desktop_observe",
        ],
        [
          "Look closer",
          "Capture the relevant region before the image is downsized.",
          "desktop_capture_region",
        ],
        [
          "Explain the detail",
          "Read the clearer evidence and relate it to the rest of the window.",
        ],
      ],
      note: "The same source ID stays scoped to this reply. A failed source is not repeatedly captured; useful text is retained.",
    },
    file: {
      nodes: ["ask", "agent", "files"],
      steps: [
        ["Find the notes", "Search relevant filenames from the working folder.", "find"],
        ["Read the match", "Inspect the file that fits your request.", "read"],
        ["Reply with what it found", "Summarize the file or ask which match you meant."],
      ],
      note: "This path uses file tools, not screen capture. Relative file paths begin at Desktop; OS permissions still apply.",
    },
    voice: {
      nodes: ["ask", "agent", "broker", "desktop"],
      steps: [
        [
          "Talk, review, send",
          "Local Whisper produces text. Only Send submits the reviewed message.",
        ],
        [
          "Observe when needed",
          "The agent uses the same desktop tools as a typed screen question.",
          "desktop_observe",
        ],
        [
          "Read the reply",
          "The response appears in the cat’s bubble. Spoken replies are not implemented.",
        ],
      ],
      note: "Voice input is a way into the same harness. It does not start a continuous screen recording.",
    },
  };
  const byId = (id) => document.getElementById(id);
  const nodes = Array.from(document.querySelectorAll("[data-node]"));
  const sections = Array.from(document.querySelectorAll(".guide-section"));
  const links = Array.from(document.querySelectorAll(".contents nav a"));

  function showComponent(id) {
    const [title, description, source, change] = components[id];
    byId("component-title").textContent = title;
    byId("component-description").textContent = description;
    byId("component-source").textContent = source;
    byId("component-change").textContent = change;
    for (const node of nodes) node.setAttribute("aria-pressed", String(node.dataset.node === id));
  }
  for (const node of nodes) node.addEventListener("click", () => showComponent(node.dataset.node));

  function showExample() {
    const example = examples[byId("example").value];
    for (const node of nodes)
      node.classList.toggle("on-path", example.nodes.includes(node.dataset.node));
    byId("trace-steps").replaceChildren(
      ...example.steps.map(([title, text, tool]) => {
        const li = document.createElement("li");
        const heading = document.createElement("strong");
        heading.textContent = title;
        li.append(heading, document.createTextNode(text));
        if (tool) {
          const link = document.createElement("a");
          link.href = `#tool-${tool}`;
          link.className = "tool-link";
          link.textContent = tool;
          li.append(document.createElement("br"), link);
        }
        return li;
      }),
    );
    byId("trace-note").textContent = example.note;
  }

  function renderTools() {
    const query = byId("tool-search").value.trim().toLowerCase();
    const family = byId("tool-family").value;
    let count = 0;
    for (const [index, entry] of Array.from(byId("tool-list").children).entries()) {
      const tool = tools[index];
      const match =
        (family === "all" || family === tool.group) &&
        `${tool.name} ${tool.title} ${tool.purpose} ${tool.returns} ${tool.limit}`
          .toLowerCase()
          .includes(query);
      entry.hidden = !match;
      if (match) count++;
    }
    byId("tool-count").textContent = `${count} of ${tools.length} tools`;
    byId("no-tools").hidden = count !== 0;
  }

  for (const tool of tools) {
    const entry = document.createElement("details");
    entry.id = `tool-${tool.name}`;
    entry.className = "tool-entry";
    const summary = document.createElement("summary");
    const family = document.createElement("span");
    family.className = `tool-family ${tool.group}`;
    family.textContent =
      tool.group === "desktop"
        ? "Desktop observation"
        : tool.group === "utilities"
          ? "Everyday utilities"
          : "Files & shell";
    const title = document.createElement("strong");
    title.textContent = tool.title;
    const name = document.createElement("code");
    name.textContent = tool.name;
    summary.append(family, title, name);
    const description = document.createElement("div");
    description.className = "tool-description";
    for (const [label, text] of [
      ["When it helps", tool.purpose],
      ["What comes back", tool.returns],
      ["Keep in mind", tool.limit],
    ]) {
      const p = document.createElement("p");
      const b = document.createElement("b");
      b.textContent = label;
      p.append(b, document.createTextNode(text));
      description.append(p);
    }
    entry.append(summary, description);
    byId("tool-list").append(entry);
  }

  function navigate(focus = false) {
    const hash = location.hash.slice(1);
    const tool = tools.find((entry) => hash === `tool-${entry.name}`);
    const id = tool ? "tools" : sections.some((section) => section.id === hash) ? hash : "map";
    for (const section of sections) section.hidden = section.id !== id;
    for (const link of links) {
      if (link.hash === `#${id}`) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (tool) {
      byId("tool-search").value = "";
      byId("tool-family").value = "all";
      renderTools();
      const entry = byId(`tool-${tool.name}`);
      entry.open = true;
      if (focus) entry.querySelector("summary").focus();
    } else if (focus) byId("content").focus();
    byId("guide-status").textContent = `${tools.length} tools · ${byId(`${id}-title`).textContent}`;
  }

  let printState;
  window.addEventListener("beforeprint", () => {
    printState = Array.from(byId("tool-list").children).map((entry) => ({
      entry,
      open: entry.open,
      hidden: entry.hidden,
    }));
    for (const { entry } of printState) {
      entry.open = true;
      entry.hidden = false;
    }
  });
  window.addEventListener("afterprint", () => {
    for (const { entry, open, hidden } of printState ?? []) {
      entry.open = open;
      entry.hidden = hidden;
    }
  });
  byId("print-guide").addEventListener("click", () => window.print());
  byId("example").addEventListener("change", showExample);
  byId("tool-search").addEventListener("input", renderTools);
  byId("tool-family").addEventListener("change", renderTools);
  window.addEventListener("hashchange", () => navigate(true));
  showComponent("agent");
  showExample();
  renderTools();
  navigate();
})();
