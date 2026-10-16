(() => {
  "use strict";

  const DATA = window.HISTORY_MIRROR_DATA;
  const STORAGE_KEY = "history-mirror-progress-v1";
  const RESULT_KEY = "history-mirror-result-v1";
  const homeScreen = document.querySelector("#homeScreen");
  const quizScreen = document.querySelector("#quizScreen");
  const resultScreen = document.querySelector("#resultScreen");
  const startButton = document.querySelector("#startButton");
  const continueButton = document.querySelector("#continueButton");
  const lastResultButton = document.querySelector("#lastResultButton");
  const backButton = document.querySelector("#backButton");
  const exitButton = document.querySelector("#exitButton");
  const headerRestart = document.querySelector("#headerRestart");
  const progressText = document.querySelector("#progressText");
  const progressBar = document.querySelector("#progressBar");
  const sceneLabel = document.querySelector("#sceneLabel");
  const questionTitle = document.querySelector("#questionTitle");
  const answersMount = document.querySelector("#answers");
  const resultMount = document.querySelector("#resultMount");
  const toast = document.querySelector("#toast");

  let state = { index: 0, answers: [] };
  let toastTimer;

  function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setScreen(name) {
    const screens = { home: homeScreen, quiz: quizScreen, result: resultScreen };
    Object.entries(screens).forEach(([key, screen]) => {
      const active = key === name;
      screen.hidden = !active;
      screen.classList.toggle("is-active", active);
    });
    headerRestart.hidden = name === "home";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  function updateContinueState() {
    const saved = loadJSON(STORAGE_KEY);
    const hasProgress = saved && Array.isArray(saved.answers) && saved.answers.some(Number.isInteger) && saved.answers.length < DATA.questions.length;
    continueButton.hidden = !hasProgress;
    lastResultButton.hidden = !loadJSON(RESULT_KEY);
  }

  function startFresh() {
    state = { index: 0, answers: [] };
    localStorage.removeItem(RESULT_KEY);
    saveProgress();
    setScreen("quiz");
    renderQuestion();
  }

  function continueQuiz() {
    const saved = loadJSON(STORAGE_KEY);
    if (!saved || !Array.isArray(saved.answers)) return startFresh();
    state = {
      index: Math.min(Number(saved.index) || 0, DATA.questions.length - 1),
      answers: saved.answers.slice(0, DATA.questions.length)
    };
    setScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    const question = DATA.questions[state.index];
    progressText.textContent = `第 ${state.index + 1} / ${DATA.questions.length} 题`;
    progressBar.style.width = `${((state.index + 1) / DATA.questions.length) * 100}%`;
    sceneLabel.textContent = question.scene;
    questionTitle.textContent = question.text;
    backButton.disabled = state.index === 0;
    answersMount.replaceChildren();

    question.options.forEach((option, optionIndex) => {
      const selected = state.answers[state.index] === optionIndex;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `answer-button${selected ? " is-selected" : ""}`;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(selected));
      button.innerHTML = `<span class="answer-index">${String.fromCharCode(65 + optionIndex)}</span><span class="answer-text"></span>`;
      button.querySelector(".answer-text").textContent = option.text;
      button.addEventListener("click", () => chooseAnswer(optionIndex));
      answersMount.append(button);
    });
    questionTitle.focus({ preventScroll: true });
  }

  function chooseAnswer(optionIndex) {
    state.answers[state.index] = optionIndex;
    state.answers = state.answers.slice(0, Math.max(state.answers.length, state.index + 1));
    saveProgress();
    [...answersMount.children].forEach((button, index) => {
      const selected = index === optionIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });

    window.setTimeout(() => {
      if (state.index < DATA.questions.length - 1) {
        state.index += 1;
        saveProgress();
        renderQuestion();
      } else {
        finishQuiz();
      }
    }, 180);
  }

  function dimensionScores() {
    const totals = Object.fromEntries(DATA.dimensions.map(d => [d.id, 0]));
    const maximums = Object.fromEntries(DATA.dimensions.map(d => [d.id, 0]));

    DATA.questions.forEach((question, questionIndex) => {
      DATA.dimensions.forEach(dimension => {
        maximums[dimension.id] += Math.max(...question.options.map(option => option.weights[dimension.id] || 0));
      });
      const selected = question.options[state.answers[questionIndex]];
      if (!selected) return;
      Object.entries(selected.weights).forEach(([dimension, value]) => { totals[dimension] += value; });
    });

    return Object.fromEntries(DATA.dimensions.map(dimension => {
      const ratio = maximums[dimension.id] ? totals[dimension.id] / maximums[dimension.id] : 0;
      return [dimension.id, Math.round(34 + Math.min(1, ratio) * 64)];
    }));
  }

  function comparePerson(person, scores) {
    const values = DATA.dimensions.map((dimension, index) => Math.abs(scores[dimension.id] - person.target[index]));
    const closeness = 1 - values.reduce((sum, value) => sum + value, 0) / (values.length * 100);
    const match = Math.min(97, Math.max(73, Math.round(72 + closeness * 27)));
    return { person, closeness, match };
  }

  function buildResult() {
    const scores = dimensionScores();
    const ranking = DATA.people
      .map(person => comparePerson(person, scores))
      .sort((a, b) => b.closeness - a.closeness);
    return { scores, ranking, completedAt: new Date().toISOString() };
  }

  function finishQuiz() {
    const result = buildResult();
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));
    localStorage.removeItem(STORAGE_KEY);
    renderResult(result);
    setScreen("result");
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function renderResult(result) {
    const winner = result.ranking[0];
    const person = winner.person;
    const dimensionHTML = DATA.dimensions.map(dimension => {
      const score = result.scores[dimension.id];
      return `<div class="dimension-item"><span>${escapeHTML(dimension.label)}</span><div class="dimension-bar" aria-label="${escapeHTML(dimension.label)} ${score} 分"><span style="--score:${score}%"></span></div><span class="dimension-score">${score}</span></div>`;
    }).join("");
    const nearbyHTML = result.ranking.slice(1, 3).map(item => `<div class="nearby-card"><strong>${escapeHTML(item.person.name)} · ${item.match}%</strong><span>${escapeHTML(item.person.archetype)}</span></div>`).join("");

    resultMount.innerHTML = `
      <div class="result-actions" aria-label="结果操作">
        <button class="primary-button" id="saveCardButton" type="button">保存结果卡 <span aria-hidden="true">↓</span></button>
        <button class="secondary-button" id="copyResultButton" type="button">复制结果文案</button>
        <button class="secondary-button" id="printButton" type="button">打印完整报告</button>
      </div>
      <article style="--result-accent:${person.accent};--result-wash:${person.wash}">
        <section class="result-hero">
          <div class="result-portrait">
            <span class="portrait-glyph" aria-hidden="true">${escapeHTML(person.glyph)}</span>
            <span class="era-stamp">${escapeHTML(person.era)}</span>
          </div>
          <div class="result-intro">
            <p class="result-overline">你的历史人物原型匹配结果</p>
            <div class="match-score"><strong>${winner.match}%</strong><span>匹配</span></div>
            <h1 id="resultTitle">${escapeHTML(person.name)}</h1>
            <p class="result-role">${escapeHTML(person.role)} · ${escapeHTML(person.archetype)}</p>
            <div class="tag-row">${person.tags.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}</div>
            <p class="result-motto">“${escapeHTML(person.motto)}”</p>
          </div>
        </section>

        <div class="report-grid">
          <section class="report-section full"><span class="section-number">壹 · 人物底色</span><h2>你像的不是经历，而是回应世界的方式</h2><p>${escapeHTML(person.summary)}</p></section>
          <section class="report-section full"><span class="section-number">贰 · 八维能力</span><h2>你的行动结构</h2><div class="dimension-list">${dimensionHTML}</div></section>
          <section class="report-section"><span class="section-number">叁 · 共振之处</span><h2>你们共享的三个底色</h2><ol class="resonance-list">${person.resonance.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ol></section>
          <section class="report-section"><span class="section-number">肆 · 现实投影</span><h2>这种特质如何进入日常</h2><p>${escapeHTML(person.reality)}</p></section>
          <section class="report-section"><span class="section-number">伍 · 盲点提醒</span><h2>优势用过头时</h2><p>${escapeHTML(person.blindspot)}</p><div class="advice-box"><strong>给你的破局建议</strong><p>${escapeHTML(person.advice)}</p></div></section>
          <section class="report-section"><span class="section-number">陆 · 人物台词</span><h2>写给此刻的三句话</h2><div class="quotes">${person.lines.map(line => `<p class="quote-line">“${escapeHTML(line)}”</p>`).join("")}</div></section>
          <section class="report-section full"><span class="section-number">柒 · 邻近原型</span><h2>你身上还有这些历史回声</h2><div class="nearby-matches">${nearbyHTML}</div></section>
        </div>
      </article>
      <div class="result-bottom"><button class="text-button" id="resultRestartButton" type="button">重新照一次镜子</button></div>
      <canvas class="share-canvas" id="shareCanvas" width="1080" height="1440" aria-hidden="true"></canvas>
    `;

    document.querySelector("#saveCardButton").addEventListener("click", () => saveShareCard(result));
    document.querySelector("#copyResultButton").addEventListener("click", () => copyResult(result));
    document.querySelector("#printButton").addEventListener("click", () => window.print());
    document.querySelector("#resultRestartButton").addEventListener("click", startFresh);
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const character of text) {
      const candidate = line + character;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = character;
      } else line = candidate;
    }
    if (line) lines.push(line);
    return lines;
  }

  function saveShareCard(result) {
    const { person, match } = result.ranking[0];
    const canvas = document.querySelector("#shareCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f5f0e4";
    ctx.fillRect(0, 0, 1080, 1440);
    ctx.strokeStyle = person.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(64, 64, 952, 1312);
    ctx.strokeStyle = "rgba(25,36,31,.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(82, 82, 916, 1276);

    ctx.fillStyle = person.wash;
    ctx.beginPath();
    ctx.arc(540, 330, 192, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = person.accent;
    ctx.stroke();
    ctx.fillStyle = person.accent;
    ctx.textAlign = "center";
    ctx.font = '700 230px "Songti SC", serif';
    ctx.fillText(person.glyph, 540, 406);

    ctx.fillStyle = "#4e5a53";
    ctx.font = '32px "PingFang SC", sans-serif';
    ctx.fillText("我的历史人物原型", 540, 610);
    ctx.fillStyle = person.accent;
    ctx.font = '700 104px "Songti SC", serif';
    ctx.fillText(`${person.name}  ${match}%`, 540, 730);
    ctx.fillStyle = "#19241f";
    ctx.font = '42px "Songti SC", serif';
    ctx.fillText(person.archetype, 540, 792);

    ctx.fillStyle = "#4e5a53";
    ctx.font = '30px "PingFang SC", sans-serif';
    const mottoLines = wrapCanvasText(ctx, person.motto, 780);
    mottoLines.forEach((line, index) => ctx.fillText(line, 540, 885 + index * 48));

    const topDimensions = DATA.dimensions
      .map(dimension => ({ label: dimension.label, score: result.scores[dimension.id] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    ctx.font = '28px "PingFang SC", sans-serif';
    topDimensions.forEach((dimension, index) => {
      const x = 220 + index * 320;
      ctx.fillStyle = "#19241f";
      ctx.fillText(dimension.label, x, 1055);
      ctx.fillStyle = person.accent;
      ctx.font = '700 48px "Songti SC", serif';
      ctx.fillText(String(dimension.score), x, 1110);
      ctx.font = '28px "PingFang SC", sans-serif';
    });

    ctx.strokeStyle = "rgba(25,36,31,.24)";
    ctx.beginPath();
    ctx.moveTo(150, 1170);
    ctx.lineTo(930, 1170);
    ctx.stroke();
    ctx.fillStyle = "#4e5a53";
    ctx.font = '26px "PingFang SC", sans-serif';
    ctx.fillText("人物志镜 · 16 道情境题 · 趣味自我观察", 540, 1240);
    ctx.fillStyle = person.accent;
    ctx.font = '700 34px "Songti SC", serif';
    ctx.fillText("见性格，也见选择", 540, 1300);

    try {
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `我的历史人物原型-${person.name}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      showToast("结果卡已保存");
    } catch {
      showToast("结果卡生成失败，请使用打印功能保存");
    }
  }

  async function copyResult(result) {
    const { person, match } = result.ranking[0];
    const top = DATA.dimensions
      .map(dimension => ({ label: dimension.label, score: result.scores[dimension.id] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.label)
      .join("、");
    const text = `我的历史人物原型是${person.name}，匹配度 ${match}%｜${person.archetype}\n优势维度：${top}\n${person.motto}\n——人物志镜·趣味测试`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("结果文案已复制");
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
      showToast("结果文案已复制");
    }
  }

  startButton.addEventListener("click", startFresh);
  continueButton.addEventListener("click", continueQuiz);
  lastResultButton.addEventListener("click", () => {
    const saved = loadJSON(RESULT_KEY);
    if (!saved || !saved.ranking) return;
    const refreshedRanking = saved.ranking.map(item => {
      const person = DATA.people.find(candidate => candidate.id === item.person.id) || item.person;
      return { ...item, person };
    });
    renderResult({ ...saved, ranking: refreshedRanking });
    setScreen("result");
  });
  backButton.addEventListener("click", () => {
    if (state.index === 0) return;
    state.index -= 1;
    saveProgress();
    renderQuestion();
  });
  exitButton.addEventListener("click", () => {
    saveProgress();
    setScreen("home");
    updateContinueState();
    showToast("进度已保存在此浏览器");
  });
  headerRestart.addEventListener("click", startFresh);

  document.querySelector(".brand").addEventListener("click", event => {
    event.preventDefault();
    setScreen("home");
    updateContinueState();
  });

  updateContinueState();
  const existingResult = loadJSON(RESULT_KEY);
  if (existingResult && existingResult.ranking && existingResult.ranking.length) {
    const refreshedRanking = existingResult.ranking.map(item => {
      const person = DATA.people.find(candidate => candidate.id === item.person.id) || item.person;
      return { ...item, person };
    });
    renderResult({ ...existingResult, ranking: refreshedRanking });
  }
})();
