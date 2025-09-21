// script.js
// Updated to assign β's to the ORIGINAL terms in the dependency equation,
// then SUBSTITUTE and DISTRIBUTE algebraic definitions so marginal impacts
// appear as sums of the original β symbols (e.g. β1 + β2).

let statements = [];
let selectedInteractionsMap = {};
let parsedStatements = [];
let interactionOptions = {};

window.onload = () => addStatement();

function addStatement() {
  const container = document.getElementById('statements-container');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = "e.g. ntrips depends on hhsize, nchild and income";
  input.style.display = 'block';
  input.style.width = '100%';
  input.style.marginBottom = '6px';
  input.addEventListener('input', (e) => {
    const index = Array.from(container.children).indexOf(e.target);
    statements[index] = e.target.value;
  });
  container.appendChild(input);
  statements.push('');
}

function clearAll() {
  statements = [];
  selectedInteractionsMap = {};
  parsedStatements = [];
  interactionOptions = {};
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
    if (s.includes('=')) {
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
        // handle 'and' + commas
        const variables = parts[1].split(/,|\band\b|&|\+/i).map(x => x.trim()).filter(Boolean);
        out.push({ dependent, variables, type: 'dependency' });
      }
    }
  });
  return out;
}

function buildDefinitions(parsed) {
  const map = {};
  parsed.forEach(({ dependent, variables, type, rawRhs }) => {
    if (type === 'algebraic') map[dependent] = { variables, rawRhs };
  });
  return map;
}

// Expand recursively (used for building interaction options only)
function expandVariables(vars, definitions) {
  const expanded = [];
  vars.forEach(v => {
    if (definitions[v]) expanded.push(...expandVariables(definitions[v].variables, definitions));
    else expanded.push(v);
  });
  return expanded;
}

// Build pairwise interactions from expanded RHS of dependencies
function buildInteractionOptions(parsed, definitions) {
  const m = {};
  parsed.forEach(({ dependent, variables, type }) => {
    if (type === 'dependency') {
      const fullVars = expandVariables(variables, definitions);
      const opts = [];
      for (let i = 0; i < fullVars.length; i++) {
        for (let j = i + 1; j < fullVars.length; j++) {
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
  if (!selectedInteractionsMap[dep]) selectedInteractionsMap[dep] = new Set();
  if (checkbox.checked) selectedInteractionsMap[dep].add(id);
  else selectedInteractionsMap[dep].delete(id);
}

function selectAll(dep, opts, checkbox) {
  selectedInteractionsMap[dep] = new Set();
  if (checkbox.checked) opts.forEach(o => selectedInteractionsMap[dep].add(o.id));
  renderInteractionOptions(parsedStatements, interactionOptions);
}

function renderInteractionOptions(parsed, options) {
  const container = document.getElementById('interaction-container');
  container.innerHTML = '';
  const deps = Object.keys(options);
  if (deps.length === 0) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  deps.forEach(dep => {
    const depDiv = document.createElement('div');
    depDiv.className = 'interaction-dependent';
    depDiv.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
      <strong>Dependent: ${dep}</strong>
      <label style="font-size:0.9em;"><input type="checkbox" id="select-all-${dep}"> Select All</label>
    </div>`;
    const optsDiv = document.createElement('div');
    optsDiv.style.marginTop = '8px';
    options[dep].forEach(opt => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBottom = '4px';
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

    // wire select-all
    setTimeout(() => {
      const selectAllCheckbox = document.getElementById(`select-all-${dep}`);
      if (!selectAllCheckbox) return;
      selectAllCheckbox.checked = options[dep].length > 0 && selectedInteractionsMap[dep] && selectedInteractionsMap[dep].size === options[dep].length;
      selectAllCheckbox.addEventListener('change', () => selectAll(dep, options[dep], selectAllCheckbox));
    }, 0);
  });
}

// computeMarginalEffects expects distributedTerms: array of {v: baseVar, beta: 'βk'}
// It returns map baseVar -> 'βa + βb + ...' (string)
function computeMarginalEffectsFromDistributed(distributedTerms) {
  const marg = {};
  distributedTerms.forEach(({ v, beta }) => {
    if (!marg[v]) marg[v] = [];
    marg[v].push(beta);
  });
  const margExpr = {};
  Object.entries(marg).forEach(([k, arr]) => {
    // remove duplicates preserving order
    const uniq = Array.from(new Set(arr));
    margExpr[k] = uniq.join(' + ');
  });
  return margExpr;
}

function interpret() {
  parsedStatements = parseStatements();
  if (parsedStatements.length === 0) { alert("No valid statements."); return; }

  const definitions = buildDefinitions(parsedStatements);
  interactionOptions = buildInteractionOptions(parsedStatements, definitions);
  renderInteractionOptions(parsedStatements, interactionOptions);

  const mainStatements = parsedStatements.filter(s => s.type === 'dependency');
  const auxiliaryStatements = parsedStatements.filter(s => s.type === 'algebraic');

  const outputContainer = document.getElementById('output-container');
  outputContainer.innerHTML = '';

  // Render auxiliary (algebraic) defs
  if (auxiliaryStatements.length > 0) {
    const auxDiv = document.createElement('div');
    auxDiv.className = 'output';
    auxDiv.innerHTML = `<h3>Auxiliary Statements</h3>`;
    auxiliaryStatements.forEach(s => {
      auxDiv.innerHTML += `<div>${s.dependent} = ${s.rawRhs}</div>`;
    });
    outputContainer.appendChild(auxDiv);
  }

  // For each dependency statement build the model
  mainStatements.forEach(({ dependent, variables }) => {
    // 1) ASSIGN β to ORIGINAL TERMS (in the order they appear in dependency)
    const betaMapOriginal = {}; // varName -> 'βk'
    let betaCounter = 1;
    variables.forEach(v => {
      if (!betaMapOriginal[v]) {
        betaMapOriginal[v] = `β${betaCounter}`;
        betaCounter++;
      }
    });

    // 2) Add interaction betas AFTER main effects (if any selected)
    const opts = interactionOptions[dependent] || [];
    const selectedOpts = opts.filter(o => selectedInteractionsMap[dependent] && selectedInteractionsMap[dependent].has(o.id));
    const interactionBetas = {};
    selectedOpts.forEach(o => {
      interactionBetas[o.term] = `β${betaCounter}`;
      betaCounter++;
    });

    // 3) Build the ORIGINAL equation (with original variable names)
    let equation_original = `${dependent} = β0`;
    variables.forEach(v => {
      const b = betaMapOriginal[v];
      equation_original += ` + ${b}(${v})`;
    });
    selectedOpts.forEach(o => {
      equation_original += ` + ${interactionBetas[o.term]}(${o.term})`;
    });

    // 4) SUBSTITUTE algebraic definitions into the original equation
    //    Replace βk(hhsize) with βk(<rawRhs>) e.g. β1(hhsize) -> β1(nchild + nadult)
    let equation_substituted = `${dependent} = β0`;
    variables.forEach(v => {
      const b = betaMapOriginal[v];
      if (definitions[v]) {
        // keep the rawRhs exactly as user typed
        equation_substituted += ` + ${b}(${definitions[v].rawRhs})`;
      } else {
        equation_substituted += ` + ${b}(${v})`;
      }
    });
    selectedOpts.forEach(o => {
      equation_substituted += ` + ${interactionBetas[o.term]}(${o.term})`;
    });

    // 5) DISTRIBUTE betas across components for final expanded linear sum
    //    For each original term v:
    //      - if it's algebraic (definitions[v]) create terms βk(component) for each component
    //      - else keep βk(v)
    const distributedTerms = []; // list of {v: baseVar, beta: 'βk'} and also interactions as {v:term, beta}
    variables.forEach(v => {
      const b = betaMapOriginal[v];
      if (definitions[v]) {
        // split rawRhs by + and - but preserve tokens (we assume simple '+' separated)
        // Use the variables list already parsed for the definition
        definitions[v].variables.forEach(comp => {
          distributedTerms.push({ v: comp, beta: b });
        });
      } else {
        distributedTerms.push({ v: v, beta: b });
      }
    });
    // append interaction terms as composite variables (do not distribute)
    selectedOpts.forEach(o => {
      distributedTerms.push({ v: o.term, beta: interactionBetas[o.term] });
    });

    // Build distributed equation string (preserve term order)
    let equation_distributed = `${dependent} = β0`;
    distributedTerms.forEach(t => {
      equation_distributed += ` + ${t.beta}(${t.v})`;
    });

    // 6) Compute marginal effects by summing beta symbols for each base variable
    //    (ignore interaction composite variables when computing single-variable marginals)
    const distributedBaseTerms = distributedTerms.filter(t => !t.v.includes('*'));
    const marginals = computeMarginalEffectsFromDistributed(distributedBaseTerms);

    // 7) Render outputs
    const mainDiv = document.createElement('div');
    mainDiv.className = 'output';
    mainDiv.style.marginTop = '14px';
    mainDiv.innerHTML = `<h3>Main Statement</h3>`;
    mainDiv.innerHTML += `<div><strong>Dependent:</strong> ${dependent}</div>`;
    mainDiv.innerHTML += `<div style="margin-top:8px;"><strong>Original equation (as given):</strong><div class="equation" style="margin-top:6px;font-family:monospace;">${equation_original}</div></div>`;
    mainDiv.innerHTML += `<div style="margin-top:8px;"><strong>After substitution (replace algebraic defns):</strong><div class="equation" style="margin-top:6px;font-family:monospace;">${equation_substituted}</div></div>`;
    mainDiv.innerHTML += `<div style="margin-top:8px;"><strong>Distributed / Expanded equation:</strong><div class="equation" style="margin-top:6px;font-family:monospace;">${equation_distributed}</div></div>`;

    // Coefficient perspective
    const coeffPerspective = [];
    Object.entries(marginals).forEach(([v, expr]) => {
      coeffPerspective.push(`${v}: ${expr}`);
    });
    if (coeffPerspective.length > 0) {
      mainDiv.innerHTML += `<div style="margin-top:10px;"><strong>Coefficient perspective</strong><ul>${coeffPerspective.map(r => `<li>${r}</li>`).join('')}</ul></div>`;
    }

    // Interpretive statements (only combined betas for base variables)
    if (Object.keys(marginals).length > 0) {
      const interpretive = Object.entries(marginals).map(([v, expr]) =>
        `${expr} is the marginal impact of ${v} on ${dependent}, ceteris paribus.`
      );
      mainDiv.innerHTML += `<div style="margin-top:8px;"><strong>Interpretive statements</strong><ul>${interpretive.map(r => `<li>${r}</li>`).join('')}</ul></div>`;
    }

    outputContainer.appendChild(mainDiv);
  });
}
