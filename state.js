let statements = [''];
let selectedInteractionsMap = {};

function addStatement() {
  statements.push('');
  const container = document.getElementById('statements-container');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = "e.g. Demand depends on Price and Income";
  input.addEventListener('input', (e) => {
    const index = Array.from(container.children).indexOf(e.target);
    statements[index] = e.target.value;
  });
  container.appendChild(input);
}

function clearAll() {
  statements = [''];
  selectedInteractionsMap = {};
  const container = document.getElementById('statements-container');
  container.innerHTML = '';
  addStatement();
  document.getElementById('interaction-container').style.display = 'none';
  document.getElementById('output-container').innerHTML = '';
}

function parseStatements() {
  const out = [];
  const splitRe = /depends on|is affected by|is influenced by|is determined by|depends upon/i;

  statements.forEach(s => {
    if (!s || !s.trim()) return;
    s = s.trim();

    if (s.includes("=")) {
      const [lhs, rhs] = s.split('=');
      if (lhs && rhs) {
        const dependent = lhs.trim();
        const variables = rhs.split(/,|\band\b|&|\+|\-/i).map(x => x.trim()).filter(Boolean);
        out.push({ dependent, variables, type: 'algebraic', rawRhs: rhs.trim() });
      }
    } else if (splitRe.test(s)) {
      const parts = s.split(splitRe);
      if (parts.length === 2) {
        const dependent = parts[0].trim() || 'Y';
        const variables = parts[1].split(/,|\band\b|&|\+/i).map(x => x.trim()).filter(Boolean);
        out.push({ dependent, variables, type: 'dependency' });
      }
    }
  });
  return out;
}

function buildDefinitions(parsed) {
  const map = {};
  parsed.forEach(({dependent, variables, type, rawRhs}) => {
    if (type === 'algebraic') map[dependent] = { variables, rawRhs };
  });
  return map;
}

function expandVariables(vars, definitions) {
  const expanded = [];
  vars.forEach(v => {
    if (definitions[v]) {
      expanded.push(...expandVariables(definitions[v].variables, definitions));
    } else {
      expanded.push(v);
    }
  });
  return expanded;
}

function buildInteractionOptions(parsed, definitions) {
  const m = {};
  parsed.forEach(({dependent, variables, type}) => {
    if (type === 'dependency') {
      const fullVars = expandVariables(variables, definitions);
      const opts = [];
      for (let i=0;i<fullVars.length;i++) {
        for (let j=i+1;j<fullVars.length;j++) {
          const a = fullVars[i], b = fullVars[j];
          const id = `${dependent}::${a}*${b}`;
          opts.push({ id, term: `${a}*${b}`, a, b });
        }
      }
      m[dependent] = opts;
    }
  });
  return m;
}

function toggleInteraction(dep, id, checkbox) {
  if(!selectedInteractionsMap[dep]) selectedInteractionsMap[dep] = new Set();
  if (checkbox.checked) selectedInteractionsMap[dep].add(id);
  else selectedInteractionsMap[dep].delete(id);
}

function selectAll(dep, opts, checkbox) {
  selectedInteractionsMap[dep] = new Set();
  if(checkbox.checked) opts.forEach(o => selectedInteractionsMap[dep].add(o.id));
  renderInteractionOptions(parsedStatements, interactionOptions);
}

let parsedStatements = [];
let interactionOptions = {};

function renderInteractionOptions(parsed, options) {
  const container = document.getElementById('interaction-container');
  container.innerHTML = '';
  const deps = Object.keys(options);
  if (deps.length === 0) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  deps.forEach(dep => {
    const depDiv = document.createElement('div');
    depDiv.className = 'interaction-dependent';
    depDiv.innerHTML = `<div style="display:flex; justify-content:space-between;">
      <strong>Dependent: ${dep}</strong>
      <label><input type="checkbox" id="select-all-${dep}"> Select All</label>
    </div>`;
    const optsDiv = document.createElement('div');
    options[dep].forEach(opt => {
      const label = document.createElement('label');
      label.style.display = 'block';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedInteractionsMap[dep] && selectedInteractionsMap[dep].has(opt.id);
      checkbox.addEventListener('change', () => toggleInteraction(dep, opt.id, checkbox));
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' ' + opt.term));
      optsDiv.appendChild(label);
    });
    depDiv.appendChild(optsDiv);
    container.appendChild(depDiv);

    const selectAllCheckbox = document.getElementById(`select-all-${dep}`);
    selectAllCheckbox.checked = options[dep].length > 0 && selectedInteractionsMap[dep] && selectedInteractionsMap[dep].size === options[dep].length;
    selectAllCheckbox.addEventListener('change', () => selectAll(dep, options[dep], selectAllCheckbox));
  });
}

function interpret() {
  parsedStatements = parseStatements();
  if (parsedStatements.length === 0) { alert("No valid statements."); return; }
  const definitions = buildDefinitions(parsedStatements);
  interactionOptions = buildInteractionOptions(parsedStatements, definitions);
  renderInteractionOptions(parsedStatements, interactionOptions);

  const results = parsedStatements.map(({dependent, variables, type, rawRhs}) => {
    if(!variables || variables.length === 0) return {dependent, error: 'No variables detected.'};
    if(type === 'algebraic') {
      return {
        dependent,
        equation: `${dependent} = ${rawRhs}`,
        betas: variables.map(v => `${v}: Component contributing to ${dependent}, ceteris paribus.`),
        factors: variables.map(v => `${v} — factor representing ${v} that builds up ${dependent}.`)
      };
    }
    if(type === 'dependency') {
      let equation = `${dependent} = β0`;
      const betas = [], factors = [];
      const expandedVars = expandVariables(variables, definitions);
      expandedVars.forEach((v,i) => { 
        const idx = i+1;
        equation += ` + β${idx}(${v})`;
        betas.push(`β${idx}: Effect of ${v} on ${dependent}, ceteris paribus.`);
        factors.push(`${v} — the factor representing changes in ${v} (affects ${dependent}).`);
      });
      const opts = interactionOptions[dependent] || [];
      let betaIndex = expandedVars.length;
      opts.forEach(opt => {
        const selected = selectedInteractionsMap[dependent] && selectedInteractionsMap[dependent].has(opt.id);
        if(selected) {
          betaIndex++;
          equation += ` + β${betaIndex}(${opt.term})`;
          betas.push(`β${betaIndex}: Interaction effect of ${opt.term} on ${dependent}.`);
          factors.push(`${opt.term} — combined factor of ${opt.a} and ${opt.b}.`);
        }
      });
      return {dependent, equation, betas, factors};
    }
  });

  const outputContainer = document.getElementById('output-container');
  outputContainer.innerHTML = '';
  results.forEach(r => {
    const div = document.createElement('div');
    div.className = 'output';
    div.innerHTML = `<strong>Dependent: ${r.dependent}</strong>`;
    if(r.error) div.innerHTML += `<div style="color:red;">${r.error}</div>`;
    if(r.equation) {
      div.innerHTML += `<div class="equation">${r.equation}</div>`;
      div.innerHTML += `<div><strong>Meaning of coefficients (β)</strong><ul>${r.betas.map(b => `<li>${b}</li>`).join('')}</ul></div>`;
      div.innerHTML += `<div><strong>Factors</strong><ul>${r.factors.map(f => `<li>${f} ceteris paribus.</li>`).join('')}</ul></div>`;
    }
    outputContainer.appendChild(div);
  });
}

// Initialize first input
addStatement();
