(function bootstrapApp() {
  "use strict";

  var BOARD_SEGMENTS = { bottom: 11, left: 9, top: 11, right: 9 }; // 총 40칸

  var EFFECT_OPTIONS = [
    { value: "none", label: "효과 없음" },
    { value: "flat_bonus", label: "즉시 비료 획득" },
    { value: "flat_penalty", label: "즉시 비료 손실" },
    { value: "next_roll_bonus", label: "다음 이동 칸수 증가/감소" },
    { value: "next_reward_multiplier", label: "다음 착지 비료 배수" },
  ];

  var TILE_TYPES = [
    { value: "normal", label: "일반 발판" },
    { value: "monster", label: "몬스터 발판" },
    { value: "question", label: "물음표 발판" },
  ];

  var SPECIAL_TYPES = [
    { value: "none", label: "일반 주사위" },
    { value: "plus_minus_one", label: "값 -1/기본/+1" },
    { value: "choose_one_to_six", label: "1~6 자유 선택" },
    { value: "double_reward", label: "착지 비료 2배" },
    { value: "ignore_monster", label: "몬스터 무시" },
    { value: "bonus_fertilizer", label: "즉시 비료 보너스" },
  ];

  var state = {
    currentPosition: 8,
    questionPolicy: "higher",
    dice: [
      { id: "die-a", label: "주사위 A", value: 4, specialType: "none", specialValue: 0, detectedNote: "기본값" },
      { id: "die-b", label: "주사위 B", value: 3, specialType: "none", specialValue: 0, detectedNote: "기본값" },
      { id: "die-c", label: "주사위 C", value: 1, specialType: "none", specialValue: 0, detectedNote: "기본값" },
    ],
    board: createFallbackBoard(),
    warnings: [],
    debug: {
      eventRectNote: "",
      boardRectNote: "",
      diceRectNote: "",
      boardCount: 0,
      diceSummary: "",
      roiCanvas: null,
    },
    sourceCanvas: null,
    detectionMeta: { eventRect: null, boardRect: null, diceRect: null, boardRegions: [], diceRegions: [] },
  };

  var elements = {
    imageInput: document.getElementById("image-input"),
    uploadDropzone: document.getElementById("upload-dropzone"),
    previewImage: document.getElementById("preview-image"),
    previewOverlay: document.getElementById("preview-overlay"),
    previewEmpty: document.getElementById("preview-empty"),
    detectionStatus: document.getElementById("detection-status"),
    loadSample: document.getElementById("load-sample"),
    currentPosition: document.getElementById("current-position"),
    questionPolicy: document.getElementById("question-policy"),
    diceEditor: document.getElementById("dice-editor"),
    boardEditor: document.getElementById("board-editor"),
    solveButton: document.getElementById("solve-button"),
    bestScore: document.getElementById("best-score"),
    bestSummary: document.getElementById("best-summary"),
    allResults: document.getElementById("all-results"),
    specialDiceAnalysis: document.getElementById("special-dice-analysis"),
    warnings: document.getElementById("warnings"),
    debugMeta: document.getElementById("debug-meta"),
    debugRoiCanvas: document.getElementById("debug-roi-canvas"),
    manualBoardX: document.getElementById("manual-board-x"),
    manualBoardY: document.getElementById("manual-board-y"),
    manualBoardW: document.getElementById("manual-board-w"),
    manualBoardH: document.getElementById("manual-board-h"),
    manualDiceX: document.getElementById("manual-dice-x"),
    manualDiceY: document.getElementById("manual-dice-y"),
    manualDiceW: document.getElementById("manual-dice-w"),
    manualDiceH: document.getElementById("manual-dice-h"),
    applyBoardRoi: document.getElementById("apply-board-roi"),
    applyDiceRoi: document.getElementById("apply-dice-roi"),
    claudeApiKey: document.getElementById("claude-api-key"),
    claudeApiSave: document.getElementById("claude-api-save"),
    claudeApiStatus: document.getElementById("claude-api-status"),
    geminiModel: document.getElementById("gemini-model"),
  };

  function createFallbackBoard() {
    var count = BOARD_SEGMENTS.bottom + BOARD_SEGMENTS.left + BOARD_SEGMENTS.top + BOARD_SEGMENTS.right;
    var board = [];
    var index;
    for (index = 0; index < count; index += 1) {
      board.push({
        id: "tile-" + index,
        label: index === 0 ? "START" : "발판 " + index,
        type: "normal",
        fertilizer: index === 0 ? 500 : 300,
        effectType: "none",
        effectValue: 0,
        leftTarget: index === 0 ? count - 1 : index - 1,
        rightTarget: index === count - 1 ? 0 : index + 1,
        detectedNote: "기본 템플릿",
      });
    }
    return board;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(maxValue, value));
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setDetectionStatus(message, kind) {
    elements.detectionStatus.textContent = message;
    elements.detectionStatus.className = "detection-status" + (kind ? " " + kind : "");
  }

  function buildOptions(options, currentValue) {
    return options
      .map(function mapOption(option) {
        var selected = option.value === currentValue ? " selected" : "";
        return '<option value="' + option.value + '"' + selected + ">" + escapeHtml(option.label) + "</option>";
      })
      .join("");
  }

  function renderPositionOptions() {
    elements.currentPosition.innerHTML = state.board
      .map(function mapTile(tile, index) {
        var selected = index === Number(state.currentPosition) ? " selected" : "";
        return '<option value="' + index + '"' + selected + ">" + index + " - " + escapeHtml(tile.label) + "</option>";
      })
      .join("");
  }

  function renderDiceEditor() {
    elements.diceEditor.innerHTML = state.dice
      .map(function mapDie(die, index) {
        return (
          '<article class="dice-card">' +
          "<h4>" + escapeHtml(die.label) + "</h4>" +
          '<label>탐지된 눈금<input type="number" min="1" max="6" data-die-index="' + index + '" data-field="value" value="' + die.value + '" /></label>' +
          '<label>탐지된 타입<select data-die-index="' + index + '" data-field="specialType">' + buildOptions(SPECIAL_TYPES, die.specialType) + "</select></label>" +
          '<label>효과 수치<input type="number" min="-20" max="20" data-die-index="' + index + '" data-field="specialValue" value="' + die.specialValue + '" /></label>' +
          '<div class="muted">' + escapeHtml(die.detectedNote || "자동 탐지") + "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderBoardEditor() {
    // 타일 인덱스 → 11×11 그리드 좌표 (row, col)
    function gridPos(idx) {
      if (idx === 0) return [11, 11];                         // START 우하단
      if (idx >= 1  && idx <= 10) return [11, 11 - idx];     // 하단 오른쪽→왼쪽
      if (idx >= 11 && idx <= 19) return [11 - (idx - 10), 1]; // 왼쪽 아래→위
      if (idx >= 20 && idx <= 30) return [1,  idx - 19];     // 상단 왼쪽→오른쪽
      if (idx >= 31 && idx <= 39) return [idx - 29, 11];     // 오른쪽 위→아래
      return null;
    }

    var cells = state.board.map(function (tile, index) {
      var pos = gridPos(index);
      if (!pos) return "";
      var isCur = index === state.currentPosition;
      var cls = "bgcell" +
        (isCur ? " bgcell-cur" : "") +
        (tile.type === "question" ? " bgcell-q" :
         tile.effectType === "next_roll_bonus" ? " bgcell-mv" :
         index === 0 ? " bgcell-start" : "");
      var idxLabel = index === 0 ? "S" : String(index);
      var inner;
      if (index === 0) {
        inner = '<span class="bgi">S</span><span class="bgv">ST</span>';
      } else if (tile.type === "question") {
        inner = '<span class="bgi">' + idxLabel + '</span><span class="bgv bgv-q">?</span>';
      } else if (tile.effectType === "next_roll_bonus") {
        inner = '<span class="bgi">' + idxLabel + '</span>' +
          '<span class="bgv bgv-mv">' + (tile.effectValue >= 0 ? "+" : "") + tile.effectValue + "칸</span>";
      } else {
        inner = '<span class="bgi">' + idxLabel + '</span>' +
          '<input class="bgv-inp" type="number" data-tile-index="' + index + '" data-field="fertilizer" value="' + tile.fertilizer + '" />';
      }
      return '<div class="' + cls + '" style="grid-row:' + pos[0] + ';grid-column:' + pos[1] + '">' + inner + "</div>";
    }).join("");

    elements.boardEditor.innerHTML = '<div class="board-grid-layout">' + cells + "</div>";
  }

  function renderWarnings(warnings) {
    elements.warnings.innerHTML = (warnings || [])
      .map(function mapWarning(item) {
        return '<div class="warning-item">' + escapeHtml(item) + "</div>";
      })
      .join("");
  }

  function renderDebugPanel() {
    var lines = [];
    lines.push("이벤트 UI: " + (state.debug.eventRectNote || "없음"));
    lines.push("보드 영역: " + (state.debug.boardRectNote || "없음"));
    lines.push("주사위 영역: " + (state.debug.diceRectNote || "없음"));
    lines.push("보드 칸 수: " + state.debug.boardCount);
    lines.push("주사위 탐지: " + (state.debug.diceSummary || "없음"));
    if (state.debug.rawResponsePreview) {
      lines.push("\n--- Gemini 원본 응답 (첫 2000자) ---");
      lines.push(state.debug.rawResponsePreview);
    }
    elements.debugMeta.textContent = lines.join("\n");

    var target = elements.debugRoiCanvas;
    var source = state.debug.roiCanvas;
    var targetContext = target.getContext("2d");

    if (!source) {
      target.width = 1;
      target.height = 1;
      targetContext.clearRect(0, 0, 1, 1);
      return;
    }

    target.width = source.width;
    target.height = source.height;
    targetContext.clearRect(0, 0, target.width, target.height);
    targetContext.drawImage(source, 0, 0);
  }

  function syncManualInputs() {
    var boardRect = state.detectionMeta.boardRect || state.detectionMeta.eventRect;
    var diceRect = state.detectionMeta.diceRect;

    if (boardRect) {
      elements.manualBoardX.value = boardRect.x;
      elements.manualBoardY.value = boardRect.y;
      elements.manualBoardW.value = boardRect.width;
      elements.manualBoardH.value = boardRect.height;
    }

    if (diceRect) {
      elements.manualDiceX.value = diceRect.x;
      elements.manualDiceY.value = diceRect.y;
      elements.manualDiceW.value = diceRect.width;
      elements.manualDiceH.value = diceRect.height;
    }
  }

  function renderResult(result) {
    elements.bestScore.textContent = result.expectedFertilizer.toFixed(2);
    if (!result.bestSequence.length) {
      elements.bestSummary.textContent = "탐지된 보드가 없어서 결과를 계산하지 못했습니다.";
      elements.allResults.innerHTML = "";
      renderWarnings(result.warnings);
      return;
    }

    elements.bestSummary.textContent = "이벤트 UI 영역을 먼저 찾은 뒤 상대좌표로 계산한 결과입니다. 값이 다르면 바로 수정해 주세요.";

    elements.allResults.innerHTML =
      '<table><thead><tr><th>순위</th><th>주사위 순서</th><th>기대 비료</th><th>주요 경로</th></tr></thead><tbody>' +
      result.allResults.slice(0, 12).map(function mapResult(entry, index) {
        return "<tr><td>" + (index + 1) + "</td><td><span class=\"pill\">" + escapeHtml(entry.order.join(" -> ")) + "</span></td><td>" + entry.expectedFertilizer.toFixed(2) + "</td><td>" + escapeHtml(entry.steps.map(function mapPath(step) { return step.dieLabel + "(+" + round(step.immediateGain) + ")"; }).join(" > ")) + "</td></tr>";
      }).join("") +
      "</tbody></table>";

    renderWarnings((state.warnings || []).concat(result.warnings || []));
    renderSpecialDiceAnalysis();
  }

  function renderSpecialDiceAnalysis() {
    var el = elements.specialDiceAnalysis;
    if (!el) return;
    if (!state.board || !state.board.length || !state.dice || !state.dice.length) {
      el.innerHTML = "";
      return;
    }

    var cfg = { currentPosition: state.currentPosition, board: state.board, dice: state.dice, questionPolicy: state.questionPolicy };
    var scenarios = window.GardenSolver.analyzeAllSpecialScenarios(cfg);
    var baseEV = scenarios[0].expectedGain;

    var rows = scenarios.map(function(s) {
      var diff = roundTwo(s.expectedGain - baseEV);
      var diffStr = diff === 0 ? "-" : (diff > 0 ? '<span style="color:#2a8a4a">+' + diff + '</span>' : '<span style="color:#c0392b">' + diff + '</span>');
      var action = "";
      if (s.firstStep) {
        if (s.firstStep.useSpecial) {
          action = "<strong>" + escapeHtml(s.firstStep.dieLabel) + "에 특수 주사위 사용</strong> (기대 +" + s.firstStep.gain + ")";
        } else {
          action = escapeHtml(s.firstStep.dieLabel) + " 먼저 사용 → " + s.firstStep.landIdx + "번칸(+" + s.firstStep.gain + ")";
        }
      }
      var highlight = s.numSpecialDice > 0 && diff > 0 ? ' style="background:rgba(42,138,74,0.07)"' : '';
      return "<tr" + highlight + "><td><strong>" + s.numSpecialDice + "개</strong></td>" +
        "<td><strong>" + s.expectedGain + "</strong></td>" +
        "<td>" + diffStr + "</td>" +
        "<td style='font-size:0.78rem'>" + action + "</td></tr>";
    });

    el.innerHTML =
      '<table><thead><tr><th>특수 주사위</th><th>최적 기댓값</th><th>증가분</th><th>첫 수 권장</th></tr></thead>' +
      '<tbody>' + rows.join("") + '</tbody></table>';
  }

  function solveAndRender() {
    renderResult(window.GardenSolver.solveScenario({
      currentPosition: Number(state.currentPosition || 0),
      questionPolicy: state.questionPolicy,
      dice: state.dice,
      board: state.board,
    }));
  }

  function renderAll() {
    renderPositionOptions();
    elements.questionPolicy.value = state.questionPolicy;
    renderDiceEditor();
    renderBoardEditor();
    renderWarnings(state.warnings);
    renderDebugPanel();
    syncManualInputs();
  }

  function syncEditorState(event) {
    var target = event.target;

    if (target.hasAttribute("data-die-index")) {
      var die = state.dice[Number(target.getAttribute("data-die-index"))];
      var dieField = target.getAttribute("data-field");
      die[dieField] = dieField === "specialType" ? target.value : Number(target.value || 0);
      solveAndRender();
      return;
    }

    if (target.hasAttribute("data-tile-index")) {
      var tile = state.board[Number(target.getAttribute("data-tile-index"))];
      var field = target.getAttribute("data-field");
      tile[field] = field === "label" || field === "type" || field === "effectType" ? target.value : Number(target.value || 0);
      renderPositionOptions();
      solveAndRender();
    }
  }

  function readFirstImageFromClipboard(event) {
    var items = event.clipboardData && event.clipboardData.items;
    var index;
    if (!items) {
      return null;
    }
    for (index = 0; index < items.length; index += 1) {
      if (items[index].type.indexOf("image/") === 0) {
        return items[index].getAsFile();
      }
    }
    return null;
  }

  function attachDropAndPasteHandlers() {
    ["dragenter", "dragover"].forEach(function addDragHandler(type) {
      elements.uploadDropzone.addEventListener(type, function onDrag(event) {
        event.preventDefault();
        elements.uploadDropzone.classList.add("drag-active");
      });
    });

    ["dragleave", "drop"].forEach(function addDropHandler(type) {
      elements.uploadDropzone.addEventListener(type, function onDrop(event) {
        event.preventDefault();
        elements.uploadDropzone.classList.remove("drag-active");
        if (type === "drop") {
          var files = event.dataTransfer && event.dataTransfer.files;
          if (files && files[0]) {
            handleIncomingImage(files[0]);
          }
        }
      });
    });

    document.addEventListener("paste", function onPaste(event) {
      var file = readFirstImageFromClipboard(event);
      if (file) {
        handleIncomingImage(file);
      }
    });
  }

  function loadImageFromBlob(file) {
    return new Promise(function resolveLoad(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function onLoad(loadEvent) {
        var image = new Image();
        image.onload = function onImageLoad() {
          resolve({ image: image, dataUrl: String(loadEvent.target.result || "") });
        };
        image.onerror = reject;
        image.src = String(loadEvent.target.result || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function createCanvas(width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function cropCanvas(sourceCanvas, rect) {
    var canvas = createCanvas(rect.width, rect.height);
    var context = canvas.getContext("2d");
    context.drawImage(sourceCanvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    return canvas;
  }

  function rgbToHue(red, green, blue) {
    var r = red / 255;
    var g = green / 255;
    var b = blue / 255;
    var maxValue = Math.max(r, g, b);
    var minValue = Math.min(r, g, b);
    var delta = maxValue - minValue;
    if (delta === 0) {
      return 0;
    }
    if (maxValue === r) {
      return ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    }
    if (maxValue === g) {
      return ((b - r) / delta + 2) * 60;
    }
    return ((r - g) / delta + 4) * 60;
  }

  function computeRegionFeatures(context, rect) {
    var pixels = context.getImageData(rect.x, rect.y, rect.width, rect.height).data;
    var red = 0;
    var green = 0;
    var blue = 0;
    var brightness = 0;
    var saturation = 0;
    var count = pixels.length / 4 || 1;
    var index;

    for (index = 0; index < pixels.length; index += 4) {
      var r = pixels[index];
      var g = pixels[index + 1];
      var b = pixels[index + 2];
      red += r;
      green += g;
      blue += b;
      brightness += (r + g + b) / 3;
      saturation += 1 - Math.min(r, g, b) / Math.max(Math.max(r, g, b), 1);
    }

    return {
      red: red / count,
      green: green / count,
      blue: blue / count,
      brightness: brightness / count,
      saturation: saturation / count,
      hue: rgbToHue(red / count, green / count, blue / count),
    };
  }

  function detectEventRect(sourceCanvas) {
    var context = sourceCanvas.getContext("2d");
    var width = sourceCanvas.width;
    var height = sourceCanvas.height;
    var step = Math.max(2, Math.round(Math.min(width, height) / 320));
    var searchLeft = Math.round(width * 0.15);
    var searchRight = Math.round(width * 0.85);
    var searchTop = Math.round(height * 0.05);
    var searchBottom = Math.round(height * 0.82);
    var minX = width;
    var minY = height;
    var maxX = 0;
    var maxY = 0;
    var hits = 0;
    var x;
    var y;

    for (y = searchTop; y < searchBottom; y += step) {
      for (x = searchLeft; x < searchRight; x += step) {
        var pixel = context.getImageData(x, y, 1, 1).data;
        var hue = rgbToHue(pixel[0], pixel[1], pixel[2]);
        var saturation = 1 - Math.min(pixel[0], pixel[1], pixel[2]) / Math.max(Math.max(pixel[0], pixel[1], pixel[2]), 1);
        var brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
        if (hue >= 250 && hue <= 330 && saturation > 0.22 && brightness > 40 && brightness < 220) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          hits += 1;
        }
      }
    }

    if (hits < 100) {
      return { x: 0, y: 0, width: width, height: height, note: "보라색 패널 검출 실패, 전체 이미지 사용" };
    }

    var boxWidth = maxX - minX;
    var boxHeight = maxY - minY;
    var rect = {
      x: Math.round(minX - boxWidth * 0.16),
      y: Math.round(minY - boxHeight * 0.16),
      width: Math.round(boxWidth * 1.3),
      height: Math.round(boxHeight * 1.18),
      note: "보라색 패널 기준으로 이벤트 UI 자동 검출",
    };

    rect.x = clamp(rect.x, 0, width - 1);
    rect.y = clamp(rect.y, 0, height - 1);
    rect.width = clamp(rect.width, 1, width - rect.x);
    rect.height = clamp(rect.height, 1, height - rect.y);
    return rect;
  }

  function buildBoardTemplate(width, height) {
    var left = width * 0.09;
    var right = width * 0.91;
    var top = height * 0.082;
    var bottom = height * 0.82;
    var tileWidth = width * 0.074;
    var tileHeight = height * 0.086;
    var bottomStep = (right - left) / (BOARD_SEGMENTS.bottom - 1);
    var verticalStep = (bottom - top) / (BOARD_SEGMENTS.left + 1);
    var regions = [];
    var index;

    for (index = 0; index < BOARD_SEGMENTS.bottom; index += 1) {
      regions.push({ x: Math.round(right - bottomStep * index - tileWidth / 2), y: Math.round(bottom - tileHeight / 2), width: Math.round(tileWidth), height: Math.round(tileHeight) });
    }
    for (index = 1; index <= BOARD_SEGMENTS.left; index += 1) {
      regions.push({ x: Math.round(left - tileWidth / 2), y: Math.round(bottom - verticalStep * index - tileHeight / 2), width: Math.round(tileWidth), height: Math.round(tileHeight) });
    }
    for (index = 0; index < BOARD_SEGMENTS.top; index += 1) {
      regions.push({ x: Math.round(left + bottomStep * index - tileWidth / 2), y: Math.round(top - tileHeight / 2), width: Math.round(tileWidth), height: Math.round(tileHeight) });
    }
    for (index = 1; index <= BOARD_SEGMENTS.right; index += 1) {
      regions.push({ x: Math.round(right - tileWidth / 2), y: Math.round(top + verticalStep * index - tileHeight / 2), width: Math.round(tileWidth), height: Math.round(tileHeight) });
    }

    return regions;
  }

  function buildDiceTemplate(width, height) {
    var faceWidth = width * 0.078;
    var faceHeight = height * 0.104;
    var y = height * 0.665;
    return [0.322, 0.432, 0.542].map(function mapCenter(ratio) {
      return { x: Math.round(width * ratio - faceWidth / 2), y: Math.round(y - faceHeight / 2), width: Math.round(faceWidth), height: Math.round(faceHeight) };
    });
  }

  function buildDicePanelRect(width, height) {
    return {
      x: Math.round(width * 0.12),
      y: Math.round(height * 0.61),
      width: Math.round(width * 0.41),
      height: Math.round(height * 0.24),
    };
  }

  function classifyTile(features) {
    if (features.hue >= 35 && features.hue <= 80 && features.saturation > 0.2) {
      return { type: "question", effectType: "none", effectValue: 0, label: "물음표 발판", note: "노랑/금색 계열" };
    }
    if (features.hue >= 170 && features.hue <= 205 && features.saturation > 0.18) {
      return { type: "monster", effectType: "next_roll_bonus", effectValue: -2, label: "이동 효과 발판", note: "청록 이동 발판 추정" };
    }
    return { type: "normal", effectType: "none", effectValue: 0, label: "일반 발판", note: "일반 보상 발판 추정" };
  }

  function normalizeOcrText(text) {
    return String(text || "").replace(/\s+/g, "").replace(/[Oo]/g, "0").replace(/[IiLl]/g, "1");
  }

  async function recognizeText(canvas, whitelist) {
    if (!window.Tesseract) {
      return "";
    }
    try {
      var result = await window.Tesseract.recognize(canvas, "eng", {
        tessedit_char_whitelist: whitelist || "0123456789+-?",
        logger: function noop() {},
      });
      return normalizeOcrText(result.data && result.data.text);
    } catch (error) {
      return "";
    }
  }

  async function detectTileReward(sourceCanvas, region) {
    var valueRect = {
      x: region.x + Math.round(region.width * 0.18),
      y: region.y + Math.round(region.height * 0.12),
      width: Math.round(region.width * 0.64),
      height: Math.round(region.height * 0.34),
    };
    var text = await recognizeText(cropCanvas(sourceCanvas, valueRect), "0123456789+-?");
    var numbers = text.match(/\d+/g);
    return numbers ? Number(numbers[0]) : 0;
  }

  function countConnectedWhiteBlobs(canvas) {
    var context = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    var pixels = context.getImageData(0, 0, width, height).data;
    var mask = new Uint8Array(width * height);
    var visited = new Uint8Array(width * height);
    var minArea = Math.max(6, Math.round((width * height) * 0.006));
    var maxArea = Math.max(minArea + 1, Math.round((width * height) * 0.14));
    var blobCount = 0;
    var index;

    for (index = 0; index < width * height; index += 1) {
      var offset = index * 4;
      var r = pixels[offset];
      var g = pixels[offset + 1];
      var b = pixels[offset + 2];
      var brightness = (r + g + b) / 3;
      var saturation = 1 - Math.min(r, g, b) / Math.max(Math.max(r, g, b), 1);
      mask[index] = brightness > 215 && saturation < 0.25 ? 1 : 0;
    }

    for (index = 0; index < width * height; index += 1) {
      if (!mask[index] || visited[index]) {
        continue;
      }

      var queue = [index];
      var area = 0;
      visited[index] = 1;

      while (queue.length) {
        var current = queue.pop();
        var x = current % width;
        var y = Math.floor(current / width);
        var nx;
        var ny;
        area += 1;

        for (ny = y - 1; ny <= y + 1; ny += 1) {
          for (nx = x - 1; nx <= x + 1; nx += 1) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            var neighbor = ny * width + nx;
            if (mask[neighbor] && !visited[neighbor]) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
      }

      if (area >= minArea && area <= maxArea) {
        blobCount += 1;
      }
    }

    return clamp(blobCount, 0, 9);
  }

  function buildDiePatternMap() {
    return {
      1: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      2: [1, 0, 0, 0, 0, 0, 0, 0, 1],
      3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      4: [1, 0, 1, 0, 0, 0, 1, 0, 1],
      5: [1, 0, 1, 0, 1, 0, 1, 0, 1],
      6: [1, 0, 1, 1, 0, 1, 1, 0, 1],
    };
  }

  function measurePipGrid(canvas) {
    var context = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    var cells = [];
    var row;
    var col;

    for (row = 0; row < 3; row += 1) {
      for (col = 0; col < 3; col += 1) {
        var cx = Math.round(width * (0.2 + col * 0.3));
        var cy = Math.round(height * (0.2 + row * 0.3));
        var radiusX = Math.max(2, Math.round(width * 0.1));
        var radiusY = Math.max(2, Math.round(height * 0.1));
        var rect = {
          x: clamp(cx - radiusX, 0, width - 1),
          y: clamp(cy - radiusY, 0, height - 1),
          width: clamp(radiusX * 2, 1, width),
          height: clamp(radiusY * 2, 1, height),
        };
        var pixels = context.getImageData(rect.x, rect.y, rect.width, rect.height).data;
        var whitePixels = 0;
        var total = pixels.length / 4 || 1;
        var index;

        for (index = 0; index < pixels.length; index += 4) {
          var r = pixels[index];
          var g = pixels[index + 1];
          var b = pixels[index + 2];
          var brightness = (r + g + b) / 3;
          var saturation = 1 - Math.min(r, g, b) / Math.max(Math.max(r, g, b), 1);
          if (brightness > 210 && saturation < 0.22) {
            whitePixels += 1;
          }
        }

        cells.push(whitePixels / total > 0.22 ? 1 : 0);
      }
    }

    return cells;
  }

  function detectDiceValue(sourceCanvas, region) {
    var faceRect = {
      x: region.x + Math.round(region.width * 0.1),
      y: region.y + Math.round(region.height * 0.06),
      width: Math.round(region.width * 0.8),
      height: Math.round(region.height * 0.72),
    };
    var crop = cropCanvas(sourceCanvas, faceRect);
    var patternMap = buildDiePatternMap();
    var measured = measurePipGrid(crop);
    var bestValue = 1;
    var bestScore = Number.NEGATIVE_INFINITY;
    var value;

    for (value = 1; value <= 6; value += 1) {
      var pattern = patternMap[value];
      var score = 0;
      var index;
      for (index = 0; index < pattern.length; index += 1) {
        score += pattern[index] === measured[index] ? 1 : -1.15;
      }
      if (score > bestScore) {
        bestScore = score;
        bestValue = value;
      }
    }

    var blobCount = countConnectedWhiteBlobs(crop);
    if (Math.abs(blobCount - bestValue) <= 1 && blobCount >= 1 && blobCount <= 6) {
      return blobCount > bestValue && bestValue === 3 && blobCount === 4 ? 4 : bestValue;
    }

    return bestValue;
  }

  function classifyDiceSpecial(features) {
    if (features.hue >= 180 && features.hue <= 250 && features.saturation > 0.18) {
      return { specialType: "ignore_monster", specialValue: 0, note: "파란 강조 주사위 추정" };
    }
    if (features.hue >= 35 && features.hue <= 75 && features.saturation > 0.22) {
      return { specialType: "double_reward", specialValue: 0, note: "금색 강조 주사위 추정" };
    }
    return { specialType: "none", specialValue: 0, note: "기본 주사위로 추정" };
  }

  function scoreCurrentTile(context, region) {
    var avatarRect = {
      x: Math.max(0, region.x - Math.round(region.width * 0.08)),
      y: Math.max(0, region.y - Math.round(region.height * 0.72)),
      width: Math.round(region.width * 1.16),
      height: Math.round(region.height * 1.45),
    };
    var pixels = context.getImageData(avatarRect.x, avatarRect.y, avatarRect.width, avatarRect.height).data;
    var total = pixels.length / 4 || 1;
    var hairPixels = 0;
    var skinPixels = 0;
    var outfitPixels = 0;
    var footingPixels = 0;
    var index;

    for (index = 0; index < pixels.length; index += 4) {
      var r = pixels[index];
      var g = pixels[index + 1];
      var b = pixels[index + 2];
      var brightness = (r + g + b) / 3;
      var hue = rgbToHue(r, g, b);
      var pixelY = Math.floor(index / 4 / avatarRect.width);

      if (brightness < 58 && Math.abs(r - g) < 28 && Math.abs(g - b) < 28) {
        hairPixels += 1;
      }
      if (r > 150 && g > 102 && b > 78 && r > g && g > b * 0.82) {
        skinPixels += 1;
      }
      if ((brightness < 95 && b < 95) || (hue >= 8 && hue <= 28 && r > 110)) {
        outfitPixels += 1;
      }
      if (pixelY > avatarRect.height * 0.62 && brightness < 115) {
        footingPixels += 1;
      }
    }

    var hairRatio = hairPixels / total;
    var skinRatio = skinPixels / total;
    var outfitRatio = outfitPixels / total;
    var footingRatio = footingPixels / total;

    if (hairRatio < 0.015 || skinRatio < 0.008) {
      return footingRatio * 1.5;
    }

    return hairRatio * 8 + skinRatio * 18 + outfitRatio * 4 + footingRatio * 2;
  }

  async function analyzeBoard(canvas) {
    var context = canvas.getContext("2d");
    var regions = buildBoardTemplate(canvas.width, canvas.height);
    var board = [];
    var bestPositionScore = Number.NEGATIVE_INFINITY;
    var currentPosition = 0;
    var index;

    for (index = 0; index < regions.length; index += 1) {
      var region = regions[index];
      var reward = await detectTileReward(canvas, region);
      var guess = classifyTile(computeRegionFeatures(context, region));
      var positionScore = scoreCurrentTile(context, region);

      if (positionScore > bestPositionScore) {
        bestPositionScore = positionScore;
        currentPosition = index;
      }

      board.push({
        id: "tile-" + index,
        label: index === 0 ? "START" : guess.label + " " + index,
        type: guess.type,
        fertilizer: reward > 0 ? reward : guess.type === "question" ? QUESTION_TILE_EV : 300,
        effectType: guess.effectType,
        effectValue: guess.effectValue,
        leftTarget: index === 0 ? regions.length - 1 : index - 1,
        rightTarget: index === regions.length - 1 ? 0 : index + 1,
        detectedNote: guess.note + ", 현재 위치 점수 " + round(positionScore),
      });
    }

    return { board: board, currentPosition: currentPosition, regions: regions };
  }

  async function analyzeDice(canvas) {
    var context = canvas.getContext("2d");
    var regions = buildDiceTemplate(canvas.width, canvas.height);
    var dice = [];
    var index;

    for (index = 0; index < regions.length; index += 1) {
      var region = regions[index];
      var special = classifyDiceSpecial(computeRegionFeatures(context, region));
      var value = detectDiceValue(canvas, region);
      dice.push({
        id: "die-" + index,
        label: "주사위 " + String.fromCharCode(65 + index),
        value: value,
        specialType: special.specialType,
        specialValue: special.specialValue,
        detectedNote: special.note + ", 점 개수 " + value + "개 탐지",
      });
    }

    return { dice: dice, regions: regions };
  }

  function drawOverlay() {
    var image = elements.previewImage;
    var overlay = elements.previewOverlay;
    if (!image.src) {
      overlay.width = 0;
      overlay.height = 0;
      return;
    }

    overlay.width = image.clientWidth;
    overlay.height = image.clientHeight;

    var scaleX = overlay.width / (image.naturalWidth || overlay.width || 1);
    var scaleY = overlay.height / (image.naturalHeight || overlay.height || 1);
    var context = overlay.getContext("2d");
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.lineWidth = 2;

    if (state.detectionMeta.eventRect) {
      context.strokeStyle = "#ff8d3b";
      context.fillStyle = "rgba(255, 141, 59, 0.16)";
      context.fillRect(
        state.detectionMeta.eventRect.x * scaleX,
        state.detectionMeta.eventRect.y * scaleY,
        state.detectionMeta.eventRect.width * scaleX,
        state.detectionMeta.eventRect.height * scaleY
      );
      context.strokeStyle = "#ff8d3b";
      context.strokeRect(
        state.detectionMeta.eventRect.x * scaleX,
        state.detectionMeta.eventRect.y * scaleY,
        state.detectionMeta.eventRect.width * scaleX,
        state.detectionMeta.eventRect.height * scaleY
      );
      context.fillStyle = "rgba(24,24,24,0.72)";
      context.fillRect(state.detectionMeta.eventRect.x * scaleX, state.detectionMeta.eventRect.y * scaleY - 18, 92, 16);
      context.fillStyle = "#ffffff";
      context.font = "12px sans-serif";
      context.fillText("EVENT ROI", state.detectionMeta.eventRect.x * scaleX + 6, state.detectionMeta.eventRect.y * scaleY - 6);
    }

    if (state.detectionMeta.diceRect) {
      context.strokeStyle = "#ffd24a";
      context.strokeRect(
        state.detectionMeta.diceRect.x * scaleX,
        state.detectionMeta.diceRect.y * scaleY,
        state.detectionMeta.diceRect.width * scaleX,
        state.detectionMeta.diceRect.height * scaleY
      );
      context.fillStyle = "rgba(255, 210, 74, 0.2)";
      context.fillRect(
        state.detectionMeta.diceRect.x * scaleX,
        state.detectionMeta.diceRect.y * scaleY,
        state.detectionMeta.diceRect.width * scaleX,
        state.detectionMeta.diceRect.height * scaleY
      );
    }

    state.detectionMeta.boardRegions.forEach(function drawBoard(region, index) {
      context.strokeStyle = index === state.currentPosition ? "#19a974" : "#d39b42";
      context.strokeRect(region.x * scaleX, region.y * scaleY, region.width * scaleX, region.height * scaleY);
      context.fillStyle = "rgba(24,24,24,0.64)";
      context.fillRect(region.x * scaleX, region.y * scaleY, 24, 14);
      context.fillStyle = "#ffffff";
      context.fillText(String(index), region.x * scaleX + 5, region.y * scaleY + 11);
    });

    state.detectionMeta.diceRegions.forEach(function drawDie(region, index) {
      context.strokeStyle = "#4d81d8";
      context.strokeRect(region.x * scaleX, region.y * scaleY, region.width * scaleX, region.height * scaleY);
      context.fillStyle = "rgba(24,24,24,0.64)";
      context.fillRect(region.x * scaleX, region.y * scaleY, 24, 14);
      context.fillStyle = "#ffffff";
      context.fillText("D" + (index + 1), region.x * scaleX + 4, region.y * scaleY + 11);
    });
  }

  // ─── Claude Vision API 탐지 ───────────────────────────────────────────────

  var QUESTION_TILE_EV = 232.5; // 좌(200) vs 우(50*5%+100*45%+300*45%+1000*5%=232.5) → 우 기댓값 채택

  async function analyzeWithGemini(dataUrl, apiKey) {
    var commaIdx = dataUrl.indexOf(",");
    var base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    var mimeMatch = dataUrl.match(/data:([^;]+);/);
    var mediaType = mimeMatch ? mimeMatch[1] : "image/png";

    var prompt = [
      '⚠️ 반드시 지금 이미지를 직접 보고 읽으세요. 아래 예시값은 형식 안내용 플레이스홀더이며 절대 그대로 사용하지 마세요.',
      "",
      '이 스크린샷은 메이플스토리 이벤트 "진의 신비한 정원"입니다.',
      "자주색 UI 패널 바깥 테두리를 따라 사각형으로 이어진 발판(타일) 40개가 보입니다.",
      "",
      "=== 1단계: 진 캐릭터 위치 (격자 좌표로 보고) ===",
      "보드를 11×11 격자로 봅니다. 좌상단=행1·열1, 우하단=행11·열11.",
      "검은 옷 입은 남성 캐릭터(진)가 있는 칸의 행(row)과 열(col)을 읽으세요.",
      "  - 하단 행 = row 11 / 상단 행 = row 1 / 왼쪽 열 = col 1 / 오른쪽 열 = col 11",
      "  예) 왼쪽 열에서 위에서 4번째 칸 → jinRow:4, jinCol:1",
      "  예) 하단 행 오른쪽에서 3번째 칸 → jinRow:11, jinCol:9",
      "jinRow와 jinCol을 출력하면 코드가 자동으로 인덱스를 계산합니다.",
      "",
      "=== 발판 인덱스 규칙 (tiles 배열용) ===",
      "- 인덱스 0 (START): 우하단 모서리 (row11·col11)",
      "- 인덱스 1~10: 하단 행 오른쪽→왼쪽 (row11, col10→col1)",
      "- 인덱스 11~19: 왼쪽 열 아래→위 (col1, row10→row2), 정확히 9개",
      "- 인덱스 20~30: 상단 행 왼쪽→오른쪽 (row1, col1→col11), 정확히 11개",
      "- 인덱스 31~39: 오른쪽 열 위→아래 (col11, row2→row10), 정확히 9개",
      "⚠️ 각 면 발판 수: 하단 10개+왼쪽 9개+상단 11개+오른쪽 9개+START 1개=40개.",
      "⚠️ 모서리 칸을 두 면에 중복 계산하지 마세요.",
      "⚠️ 발판 위에 캐릭터·이펙트가 있어도 발판은 1개입니다.",
      "⚠️ tiles 배열은 정확히 40개여야 합니다.",
      "하단 행: START(index 0) 바로 왼쪽=index 1, ..., +10칸이동(좌하단)=index 10.",
      "  START~+10칸이동 사이 9개(index 1~9). ⚠️ 10개로 보이면 잘못 센 것.",
      "",
      "고정 랜드마크:",
      "  index 0=START(우하단,fertilizer:0) / index 10=+10칸이동(좌하단,type:move,effectValue:10) / index 30=?(우상단,type:question)",
      "",
      "=== 2단계: 주사위 3개 눈금 (매우 중요 — 반드시 단계별로 추론) ===",
      "이미지 중앙 패널 하단에 '캐릭터를 움직일 주사위를 골라 이동해주세요' 텍스트가 있습니다.",
      "그 바로 아래에 정사각형 주사위 3개가 가로로 나란히 있고, 각 주사위 바로 아래 '선택하기' 버튼이 있습니다.",
      "주사위는 어두운/컬러 배경에 흰색 점(pip)이 찍혀 있습니다.",
      "",
      "각 주사위마다 아래 절차를 반드시 따르세요:",
      "  A) '선택하기' 버튼을 기준으로 바로 위에 있는 정사각형을 찾는다",
      "  B) 그 정사각형 안의 흰 점을 하나씩 천천히 센다",
      "  C) 센 개수를 diceReasoning 필드에 '주사위N: 점 위치 [좌상/우상/중앙/...] → 합계 M개' 형식으로 기록한다",
      "  D) 그 숫자를 dice 배열에 넣는다",
      "",
      "주사위 눈금별 pip 배치 참고:",
      "  1=중앙 / 2=좌상+우하 / 3=좌상+중앙+우하 / 4=네 모서리 / 5=네 모서리+중앙 / 6=양쪽 3줄",
      "  ⚠️ 5는 4와 혼동하기 쉽습니다. 중앙 pip이 있으면 5입니다.",
      "⚠️ 주사위 3개 모두 같은 값(예: 6,6,6)이 나오면 반드시 다시 세세요. 실제로 같은 경우는 극히 드뭅니다.",
      "⚠️ 예시 숫자를 절대 복사하지 마세요. 이 이미지의 '선택하기' 위 주사위 3개를 직접 보고 읽으세요.",
      "",
      "=== 3단계: 40개 발판 비료 값 ===",
      "각 발판에 표시된 '+숫자' 값을 이미지에서 직접 읽으세요.",
      "발판 비료값 읽는 법:",
      "① 발판에 숫자가 보이면 그 숫자를 읽는다",
      "② 캐릭터/이펙트에 숫자가 가려진 경우 → 배경 색상으로 판단:",
      "   연분홍/살구색=100 / 청록·민트색=300 / 보라·연보라색=400 / 노랑·황금색=600",
      "   ⚠️ 숫자가 가려졌으면 반드시 이 색상표를 사용해야 합니다. 기본값 300 쓰지 마세요.",
      "③ 벌·몬스터 아이콘이 있어도 흰색 큰 숫자가 이미 최종값입니다. 배율 계산하지 마세요.",
      "   ⚠️ 벌 타일에 숫자가 두 개 보이면(작은 기본값 + 큰 흰색 최종값) 반드시 큰 흰색 숫자를 읽으세요.",
      "   예) 발판에 작은 '+400'과 큰 흰색 '+800'이 보이면 → fertilizer:800",
      "발판 종류 (일반 발판은 type 필드 생략):",
      "- 일반 발판: {\"index\":N,\"fertilizer\":N}",
      "- 물음표(?) 발판: {\"index\":N,\"fertilizer\":233,\"type\":\"question\"}",
      "- 이동 발판(+N칸이동): {\"index\":N,\"fertilizer\":0,\"type\":\"move\",\"effectValue\":N}",
      "- 이동 발판(-N칸이동): {\"index\":N,\"fertilizer\":0,\"type\":\"move\",\"effectValue\":-N}",
      "⚠️ 일반 발판에 type 쓰지 마세요 (토큰 절약).",
      "⚠️ 이동 발판 위치에 별도의 비료값 칸을 삽입하지 마세요.",
      "⚠️ '+10칸이동' 숫자 10을 비료값으로 착각하지 마세요. fertilizer:0, effectValue:10입니다.",
      "",
      "=== 응답 ===",
      "JSON만 출력하고 다른 텍스트는 쓰지 마세요. label 필드 출력하지 마세요.",
      "공백 없이 compact JSON: 콜론·쉼표 뒤 공백 없음.",
      "tiles 배열은 반드시 index 0부터 39까지 정확히 40개여야 합니다.",
      "출력 순서: tiles → jinRow → jinCol → dice → diceReasoning.",
      "{",
      '  "tiles": [',
      '    {"index":0,"fertilizer":0},',
      '    {"index":1,"fertilizer":300},',
      "    ... index 2~9 ...",
      '    {"index":10,"fertilizer":0,"type":"move","effectValue":10},',
      "    ... index 11~29 ...",
      '    {"index":30,"fertilizer":233,"type":"question"},',
      "    ... index 31~39 ...",
      '    {"index":39,"fertilizer":400}',
      "  ],",
      '  "jinRow": 진이있는행번호,',
      '  "jinCol": 진이있는열번호,',
      '  "dice": [주사위1,주사위2,주사위3],',
      '  "diceReasoning": "주사위1→N개. 주사위2→N개. 주사위3→N개"',
      "}",
    ].join("\n");

    var response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + (elements.geminiModel ? elements.geminiModel.value.trim() || "gemini-3-flash-preview" : "gemini-3-flash-preview") + ":generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mediaType, data: base64Data } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 16384 },
        }),
      }
    );

    if (!response.ok) {
      var errText = await response.text();
      if (response.status === 429) {
        throw new Error("Gemini 요청 한도 초과(429) — 1분 후 다시 시도하거나, Google AI Studio에서 사용량을 확인하세요.");
      }
      throw new Error("Gemini API 오류 " + response.status + ": " + errText.slice(0, 200));
    }

    var responseData = await response.json();

    // 안전 필터 차단 여부 확인
    if (responseData.promptFeedback && responseData.promptFeedback.blockReason) {
      throw new Error("Gemini 안전 필터 차단: " + responseData.promptFeedback.blockReason);
    }

    var candidate = responseData.candidates && responseData.candidates[0];
    if (candidate && candidate.finishReason === "SAFETY") {
      throw new Error("Gemini 응답이 안전 필터에 의해 차단되었습니다.");
    }
    if (candidate && candidate.finishReason === "MAX_TOKENS") {
      state.debug.rawResponsePreview = "[⚠️ MAX_TOKENS: 모델 출력 토큰 한도 도달. 응답 잘림.]\n" + (state.debug.rawResponsePreview || "");
    }

    var responseText =
      candidate &&
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts[0] &&
      candidate.content.parts[0].text;

    if (!responseText) {
      var raw = JSON.stringify(responseData).slice(0, 400);
      throw new Error("Gemini 응답 파싱 실패. 원본: " + raw);
    }

    // 원본 응답을 디버그 패널에 저장 (첫 2000자)
    state.debug.rawResponsePreview = responseText.slice(0, 2000);

    // 마크다운 코드블록 제거 후 JSON 추출
    var cleaned = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    var jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Gemini 응답에서 JSON을 찾을 수 없습니다: " + responseText.slice(0, 300));
    }

    var rawJson = jsonMatch[0];

    // JSON 수리 1: 배열/객체 내 +숫자 → 숫자 (예: [+6, +5], "effectValue": +10)
    rawJson = rawJson.replace(/([:\[,]\s*)\+(\d)/g, "$1$2");
    // JSON 수리 2: 숫자 뒤에 붙은 한글/텍스트 제거 (예: 300비료 → 300)
    rawJson = rawJson.replace(/(\d+)[가-힣a-zA-Z]+(?=\s*[,}\]])/g, "$1");
    // JSON 수리 3: 후행 쉼표 제거
    rawJson = rawJson.replace(/,(\s*[\]\}])/g, "$1");

    // 1차 시도: 정상 파싱
    try {
      return JSON.parse(rawJson);
    } catch (firstError) {
      // 2차 시도: 괄호 복구 후 재파싱
      var opens = (rawJson.match(/[\[{]/g) || []).length;
      var closes = (rawJson.match(/[\]\}]/g) || []).length;
      var repaired = rawJson.trimEnd().replace(/,\s*\{[^{}]*$/, "");
      while (opens > closes) {
        repaired += (repaired.slice(-1) === "[" || repaired.slice(-1) === ",") ? "]" : "}";
        closes++;
      }
      repaired = repaired.replace(/,(\s*[\]\}])/g, "$1");
      try {
        var r2 = JSON.parse(repaired);
        r2._truncated = true;
        return r2;
      } catch (secondError) {
        // 3차 시도: 정규식으로 핵심 필드 추출 (JSON 구조 무시) — 원본 전체 텍스트 대상
        var fallback = extractGeminiFieldsRegex(responseText);
        fallback._regexFallback = true;
        fallback._parseError = firstError.message;
        state.debug.rawResponsePreview = (state.debug.rawResponsePreview || "") + "\n\n[파싱 오류: " + firstError.message + "]";
        return fallback;
      }
    }
  }

  // JSON 파싱 실패 시 정규식으로 핵심 필드 추출 (window 방식 — 중첩 {} 무관)
  function extractGeminiFieldsRegex(text) {
    var result = { tiles: [], dice: [1, 1, 1], jinTileIndex: 0, diceReasoning: "", notes: "" };
    var m;

    m = text.match(/"jinTileIndex"\s*:\s*(\d+)/);
    if (m) result.jinTileIndex = parseInt(m[1]);
    m = text.match(/"jinRow"\s*:\s*(\d+)/);
    if (m) result.jinRow = parseInt(m[1]);
    m = text.match(/"jinCol"\s*:\s*(\d+)/);
    if (m) result.jinCol = parseInt(m[1]);

    m = text.match(/"dice"\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) result.dice = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];

    m = text.match(/"diceReasoning"\s*:\s*"([^"]*)"/);
    if (m) result.diceReasoning = m[1];

    m = text.match(/"notes"\s*:\s*"([^"]*)"/);
    if (m) result.notes = m[1];

    // "index": N 위치 수집
    var indexRe = /[{,]\s*"index"\s*:\s*(\d+)/g;
    var positions = [];
    var tm;
    while ((tm = indexRe.exec(text)) !== null) {
      var idx = parseInt(tm[1]);
      if (idx >= 0 && idx <= 39) {
        positions.push({ idx: idx, pos: tm.index });
      }
    }

    for (var i = 0; i < positions.length; i++) {
      var idx = positions[i].idx;
      var wStart = positions[i].pos;
      var wEnd = i + 1 < positions.length ? positions[i + 1].pos : Math.min(text.length, wStart + 400);
      var win = text.slice(wStart, wEnd);

      var fert = 0, type = "normal", effectValue = 0;
      var fm = win.match(/"fertilizer"\s*:\s*(\d+)/); if (fm) fert = parseInt(fm[1]);
      var tyM = win.match(/"type"\s*:\s*"(\w+)"/); if (tyM) type = tyM[1];
      var em = win.match(/"effectValue"\s*:\s*(-?\d+)/); if (em) effectValue = parseInt(em[1]);
      result.tiles.push({ index: idx, fertilizer: fert, type: type, effectValue: effectValue });
    }

    // 중복 index 제거 (마지막 것 우선)
    var seen = {};
    var deduped = [];
    for (var j = result.tiles.length - 1; j >= 0; j--) {
      if (!seen[result.tiles[j].index]) {
        seen[result.tiles[j].index] = true;
        deduped.unshift(result.tiles[j]);
      }
    }
    result.tiles = deduped;

    return result;
  }

  // 11×11 격자 좌표(row 1=상단, col 1=좌측) → 타일 인덱스
  function gridToTileIndex(row, col) {
    row = Number(row); col = Number(col);
    if (row === 11) return 11 - col;               // 하단: col11→0, col1→10
    if (col === 1 && row >= 2 && row <= 10) return 21 - row;  // 왼쪽: row10→11, row2→19
    if (row === 1) return 19 + col;                // 상단: col1→20, col11→30
    if (col === 11 && row >= 2 && row <= 10) return 29 + row; // 오른쪽: row2→31, row10→39
    return 0;
  }

  function repairTileExtras(tilesData) {
    // 각 구간별로 extra 타일 삽입 감지 후 재인덱싱
    // 구간: [1-9]=9개, [11-19]=9개, [20-29]=10개, [31-39]=9개 (모서리 랜드마크 제외)
    var sorted = tilesData.slice().sort(function(a, b) { return a.index - b.index; });
    var segments = [
      { start: 1, end: 9 },
      { start: 11, end: 19 },
      { start: 20, end: 29 },
      { start: 31, end: 39 },
    ];
    var repaired = [];
    var landmarks = sorted.filter(function(t) { return t.index === 0 || t.index === 10 || t.index === 30; });
    repaired = repaired.concat(landmarks);

    segments.forEach(function(seg) {
      var tiles = sorted.filter(function(t) { return t.index >= seg.start && t.index <= seg.end; });
      var expected = seg.end - seg.start + 1;
      if (tiles.length > expected) {
        tiles = tiles.slice(0, expected);
      }
      tiles.forEach(function(t, i) { t.index = seg.start + i; });
      repaired = repaired.concat(tiles);
    });
    return repaired;
  }

  function buildBoardFromClaudeResult(claudeResult) {
    var totalTiles =
      BOARD_SEGMENTS.bottom + BOARD_SEGMENTS.left + BOARD_SEGMENTS.top + BOARD_SEGMENTS.right;
    var tilesData = claudeResult.tiles || [];
    tilesData = repairTileExtras(tilesData);
    claudeResult._tileCount = tilesData.length;
    var board = [];
    var i;
    var j;

    for (i = 0; i < totalTiles; i += 1) {
      var tileData = null;
      for (j = 0; j < tilesData.length; j += 1) {
        if (Number(tilesData[j].index) === i) {
          tileData = tilesData[j];
          break;
        }
      }
      if (!tileData) {
        tileData = { fertilizer: 300, type: "normal", label: "발판 " + i };
      }

      var fertilizer = Number(tileData.fertilizer || 0);
      var type = tileData.type || "normal";
      var label = tileData.label || (i === 0 ? "START" : "발판 " + i);
      var effectType = "none";
      var effectValue = 0;

      if (type === "move") {
        effectType = "next_roll_bonus";
        effectValue = Number(tileData.effectValue || 0);
        fertilizer = 0;
        type = "normal";
      }

      if (type === "question") {
        fertilizer = QUESTION_TILE_EV;
      }

      board.push({
        id: "tile-" + i,
        label: label,
        type: type === "question" ? "question" : "normal",
        fertilizer: fertilizer,
        effectType: effectType,
        effectValue: effectValue,
        leftTarget: i === 0 ? totalTiles - 1 : i - 1,
        rightTarget: i === totalTiles - 1 ? 0 : i + 1,
        detectedNote: "Claude Vision AI 탐지",
      });
    }

    return board;
  }

  async function detectWithGemini(image, dataUrl, apiKey) {
    setDetectionStatus("Gemini AI로 보드·주사위·진 위치를 분석 중입니다...", "loading");

    var sourceCanvas = createCanvas(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height
    );
    sourceCanvas.getContext("2d").drawImage(image, 0, 0);
    state.sourceCanvas = sourceCanvas;

    var claudeResult = await analyzeWithGemini(dataUrl, apiKey);

    state.board = buildBoardFromClaudeResult(claudeResult);
    var jinIdx = 0;
    if (claudeResult.jinRow && claudeResult.jinCol) {
      jinIdx = gridToTileIndex(claudeResult.jinRow, claudeResult.jinCol);
    } else if (claudeResult.jinTileIndex) {
      jinIdx = Number(claudeResult.jinTileIndex);
    }
    state.currentPosition = clamp(jinIdx, 0, state.board.length - 1);

    var diceValues = claudeResult.dice || [1, 1, 1];
    state.dice = diceValues.slice(0, 3).map(function buildDie(value, index) {
      return {
        id: "die-" + index,
        label: "주사위 " + String.fromCharCode(65 + index),
        value: clamp(Number(value) || 1, 1, 6),
        specialType: "none",
        specialValue: 0,
        detectedNote: "Claude AI: 눈금 " + value,
      };
    });

    while (state.dice.length < 3) {
      var idx = state.dice.length;
      state.dice.push({
        id: "die-" + idx,
        label: "주사위 " + String.fromCharCode(65 + idx),
        value: 1,
        specialType: "none",
        specialValue: 0,
        detectedNote: "Claude AI 탐지 누락 - 기본값",
      });
    }

    var tileCountWarn = "";
    if (claudeResult._tileCount !== undefined && claudeResult._tileCount !== 40) {
      tileCountWarn = "⚠️ Gemini가 발판을 " + claudeResult._tileCount + "개 탐지했습니다 (정상: 40개). 보드에 잘못 삽입된 칸이 있을 수 있으니 직접 확인해 주세요.";
    }
    state.warnings = [
      "Gemini Vision AI로 자동 탐지했습니다.",
      tileCountWarn,
      claudeResult._truncated ? "⚠️ Gemini 응답이 잘려서 일부 발판 정보가 누락됐을 수 있습니다. 보드 칸 수를 확인해 주세요." : "",
      claudeResult._regexFallback ? "⚠️ JSON 파싱 실패 — 정규식으로 데이터를 복구했습니다. 값을 반드시 확인해 주세요." : "",
      claudeResult.notes ? "AI 메모: " + claudeResult.notes : "",
    ].filter(Boolean);

    // AI 모드에서는 픽셀 기반 오버레이를 표시하지 않음 (위치가 부정확하므로)
    state.detectionMeta.eventRect = null;
    state.detectionMeta.boardRect = null;
    state.detectionMeta.diceRect = null;
    state.detectionMeta.boardRegions = [];
    state.detectionMeta.diceRegions = [];

    state.debug.eventRectNote = "Gemini Vision API 사용";
    state.debug.boardRectNote = "Gemini AI 탐지 (픽셀 좌표 없음)";
    state.debug.diceRectNote = claudeResult.diceReasoning || "추론 없음";
    var rawTiles = claudeResult.tiles || [];
    state.debug.rawTilesPreview = rawTiles.slice(0, 13).map(function(t) {
      return "[" + t.index + "] " + t.type + " fert=" + t.fertilizer + (t.effectValue ? " ev=" + t.effectValue : "") + (t.label ? " \"" + t.label + "\"" : "");
    }).join("\n");
    state.debug.boardCount = state.board.length;
    state.debug.diceSummary = state.dice
      .map(function mapDie(d) { return d.label + ":" + d.value; })
      .join(", ");
    state.debug.roiCanvas = null;

    renderAll();
    drawOverlay();
    solveAndRender();
    setDetectionStatus(
      "Claude AI 탐지 완료 — 진 위치: " + state.currentPosition +
      "번 발판, 주사위: " + diceValues.slice(0, 3).join(" / "),
      "success"
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  async function detectScenario(image) {
    var sourceCanvas = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
    var sourceContext = sourceCanvas.getContext("2d");
    sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
    state.sourceCanvas = sourceCanvas;

    setDetectionStatus("전체 이미지에서 이벤트 UI 영역을 먼저 찾는 중입니다.", "loading");

    var eventRect = detectEventRect(sourceCanvas);
    var eventCanvas = cropCanvas(sourceCanvas, eventRect);
    var boardResult = await analyzeBoard(eventCanvas);
    var dicePanelRect = buildDicePanelRect(eventCanvas.width, eventCanvas.height);
    var diceCanvas = cropCanvas(eventCanvas, dicePanelRect);
    var diceResult = await analyzeDice(diceCanvas);

    state.board = boardResult.board;
    state.currentPosition = boardResult.currentPosition;
    state.dice = diceResult.dice;
    state.warnings = [
      "이제는 전체 스크린샷이 아니라 보라색 중앙 패널을 먼저 찾고 그 주변만 이벤트 UI로 간주합니다.",
      "그래서 해상도나 여백이 달라도 먼저 UI를 잘라낸 뒤 상대좌표로 보드를 읽습니다.",
      "주사위 값은 흰 점 개수와 3x3 점 배치 패턴을 함께 비교해 읽습니다.",
    ];

    state.detectionMeta.eventRect = eventRect;
    state.detectionMeta.boardRect = eventRect;
    state.detectionMeta.diceRect = {
      x: eventRect.x + dicePanelRect.x,
      y: eventRect.y + dicePanelRect.y,
      width: dicePanelRect.width,
      height: dicePanelRect.height,
    };
    state.detectionMeta.boardRegions = boardResult.regions.map(function mapRegion(region) {
      return { x: region.x + eventRect.x, y: region.y + eventRect.y, width: region.width, height: region.height };
    });
    state.detectionMeta.diceRegions = diceResult.regions.map(function mapRegion(region) {
      return {
        x: region.x + eventRect.x + dicePanelRect.x,
        y: region.y + eventRect.y + dicePanelRect.y,
        width: region.width,
        height: region.height,
      };
    });
    state.debug.eventRectNote =
      eventRect.note +
      " / x=" +
      eventRect.x +
      ", y=" +
      eventRect.y +
      ", w=" +
      eventRect.width +
      ", h=" +
      eventRect.height;
    state.debug.boardRectNote =
      "x=" +
      eventRect.x +
      ", y=" +
      eventRect.y +
      ", w=" +
      eventRect.width +
      ", h=" +
      eventRect.height;
    state.debug.boardCount = boardResult.regions.length;
    state.debug.diceRectNote =
      "x=" +
      (eventRect.x + dicePanelRect.x) +
      ", y=" +
      (eventRect.y + dicePanelRect.y) +
      ", w=" +
      dicePanelRect.width +
      ", h=" +
      dicePanelRect.height;
    state.debug.diceSummary = diceResult.dice
      .map(function mapDie(die) {
        return die.label + ":" + die.value;
      })
      .join(", ");
    state.debug.roiCanvas = eventCanvas;

    renderAll();
    drawOverlay();
    solveAndRender();
    setDetectionStatus("자동 탐지가 완료되었습니다. 검출한 이벤트 UI 기준으로 결과를 보여줍니다.", "success");
  }

  async function reanalyzeWithManualRects(boardRect, diceRect) {
    if (!state.sourceCanvas) {
      state.warnings = ["먼저 이미지를 업로드해 주세요."];
      renderWarnings(state.warnings);
      return;
    }

    var normalizedBoardRect = {
      x: clamp(Math.round(boardRect.x), 0, state.sourceCanvas.width - 1),
      y: clamp(Math.round(boardRect.y), 0, state.sourceCanvas.height - 1),
      width: clamp(Math.round(boardRect.width), 1, state.sourceCanvas.width),
      height: clamp(Math.round(boardRect.height), 1, state.sourceCanvas.height),
      note: "수동 보정된 보드판 ROI",
    };
    normalizedBoardRect.width = clamp(normalizedBoardRect.width, 1, state.sourceCanvas.width - normalizedBoardRect.x);
    normalizedBoardRect.height = clamp(normalizedBoardRect.height, 1, state.sourceCanvas.height - normalizedBoardRect.y);

    var boardCanvas = cropCanvas(state.sourceCanvas, normalizedBoardRect);
    var boardResult = await analyzeBoard(boardCanvas);

    state.board = boardResult.board;
    state.currentPosition = boardResult.currentPosition;
    state.detectionMeta.eventRect = normalizedBoardRect;
    state.detectionMeta.boardRect = normalizedBoardRect;
    state.detectionMeta.boardRegions = boardResult.regions.map(function mapRegion(region) {
      return {
        x: region.x + normalizedBoardRect.x,
        y: region.y + normalizedBoardRect.y,
        width: region.width,
        height: region.height,
      };
    });
    state.debug.eventRectNote = "수동 보정된 보드판 ROI";
    state.debug.boardRectNote =
      "x=" + normalizedBoardRect.x +
      ", y=" + normalizedBoardRect.y +
      ", w=" + normalizedBoardRect.width +
      ", h=" + normalizedBoardRect.height;
    state.debug.boardCount = boardResult.regions.length;
    state.debug.roiCanvas = boardCanvas;

    if (diceRect) {
      var normalizedDiceRect = {
        x: clamp(Math.round(diceRect.x), 0, state.sourceCanvas.width - 1),
        y: clamp(Math.round(diceRect.y), 0, state.sourceCanvas.height - 1),
        width: clamp(Math.round(diceRect.width), 1, state.sourceCanvas.width),
        height: clamp(Math.round(diceRect.height), 1, state.sourceCanvas.height),
      };
      normalizedDiceRect.width = clamp(normalizedDiceRect.width, 1, state.sourceCanvas.width - normalizedDiceRect.x);
      normalizedDiceRect.height = clamp(normalizedDiceRect.height, 1, state.sourceCanvas.height - normalizedDiceRect.y);

      var diceCanvas = cropCanvas(state.sourceCanvas, normalizedDiceRect);
      var diceResult = await analyzeDice(diceCanvas);
      state.dice = diceResult.dice;
      state.detectionMeta.diceRect = normalizedDiceRect;
      state.detectionMeta.diceRegions = diceResult.regions.map(function mapRegion(region) {
        return {
          x: region.x + normalizedDiceRect.x,
          y: region.y + normalizedDiceRect.y,
          width: region.width,
          height: region.height,
        };
      });
      state.debug.diceRectNote =
        "x=" + normalizedDiceRect.x +
        ", y=" + normalizedDiceRect.y +
        ", w=" + normalizedDiceRect.width +
        ", h=" + normalizedDiceRect.height;
      state.debug.diceSummary = diceResult.dice
        .map(function mapDie(die) {
          return die.label + ":" + die.value;
        })
        .join(", ");
    }

    state.warnings = ["수동 ROI 보정값을 적용했습니다. 자동 탐지가 틀릴 때 이 값을 조정해서 바로 복구할 수 있어요."];
    renderAll();
    drawOverlay();
    solveAndRender();
    setDetectionStatus("수동 ROI 보정값을 적용했습니다.", "success");
  }

  async function handleIncomingImage(file) {
    try {
      setDetectionStatus("이미지를 불러오는 중입니다.", "loading");
      var loaded = await loadImageFromBlob(file);
      elements.previewImage.src = loaded.dataUrl;
      elements.previewImage.classList.add("visible");
      elements.previewEmpty.style.display = "none";

      var apiKey = elements.claudeApiKey && elements.claudeApiKey.value.trim();
      if (apiKey) {
        await detectWithGemini(loaded.image, loaded.dataUrl, apiKey);
      } else {
        await detectScenario(loaded.image);
      }
    } catch (error) {
      var errorMsg = error && error.message ? error.message : "알 수 없는 오류";
      state.warnings = ["오류 상세: " + errorMsg];
      renderWarnings(state.warnings);
      setDetectionStatus("이미지 분석 실패 — " + errorMsg, "error");
    }
  }

  elements.imageInput.addEventListener("change", function onFileChange(event) {
    var file = event.target.files && event.target.files[0];
    if (file) {
      handleIncomingImage(file);
    }
  });

  elements.loadSample.addEventListener("click", function onSample() {
    state.currentPosition = 8;
    state.questionPolicy = "higher";
    state.dice = deepClone([
      { id: "die-a", label: "주사위 A", value: 4, specialType: "none", specialValue: 0, detectedNote: "샘플" },
      { id: "die-b", label: "주사위 B", value: 3, specialType: "none", specialValue: 0, detectedNote: "샘플" },
      { id: "die-c", label: "주사위 C", value: 1, specialType: "none", specialValue: 0, detectedNote: "샘플" },
    ]);
    state.board = createFallbackBoard();
    state.warnings = ["샘플 상태를 복원했습니다. 현재 위치 8, 주사위 4/3/1 기준입니다."];
    state.detectionMeta = { eventRect: null, boardRect: null, diceRect: null, boardRegions: [], diceRegions: [] };
    renderAll();
    solveAndRender();
    setDetectionStatus("샘플 상태를 적용했습니다.", "success");
  });

  elements.solveButton.addEventListener("click", function onSolve() {
    solveAndRender();
  });

  elements.currentPosition.addEventListener("change", function onPositionChange(event) {
    state.currentPosition = Number(event.target.value || 0);
    solveAndRender();
  });

  elements.questionPolicy.addEventListener("change", function onPolicyChange(event) {
    state.questionPolicy = event.target.value;
    solveAndRender();
  });

  elements.applyBoardRoi.addEventListener("click", function onApplyBoardRoi() {
    reanalyzeWithManualRects(
      {
        x: Number(elements.manualBoardX.value || 0),
        y: Number(elements.manualBoardY.value || 0),
        width: Number(elements.manualBoardW.value || 1),
        height: Number(elements.manualBoardH.value || 1),
      },
      state.detectionMeta.diceRect || null
    );
  });

  elements.applyDiceRoi.addEventListener("click", function onApplyDiceRoi() {
    var boardRect = state.detectionMeta.boardRect || state.detectionMeta.eventRect;
    if (!boardRect) {
      state.warnings = ["먼저 이미지를 업로드하고 보드판을 탐지해 주세요."];
      renderWarnings(state.warnings);
      return;
    }

    reanalyzeWithManualRects(boardRect, {
      x: Number(elements.manualDiceX.value || 0),
      y: Number(elements.manualDiceY.value || 0),
      width: Number(elements.manualDiceW.value || 1),
      height: Number(elements.manualDiceH.value || 1),
    });
  });

  elements.diceEditor.addEventListener("input", syncEditorState);
  elements.diceEditor.addEventListener("change", syncEditorState);
  elements.boardEditor.addEventListener("input", syncEditorState);
  elements.boardEditor.addEventListener("change", syncEditorState);
  window.addEventListener("resize", drawOverlay);

  // API 키 localStorage 복원
  (function initApiKey() {
    var saved = localStorage.getItem("gardenHelperApiKey");
    if (saved && elements.claudeApiKey) {
      elements.claudeApiKey.value = saved;
      if (elements.claudeApiStatus) {
        elements.claudeApiStatus.textContent = "키 저장됨";
        elements.claudeApiStatus.className = "api-status-badge api-status-ok";
      }
    }
  })();

  if (elements.claudeApiSave) {
    elements.claudeApiSave.addEventListener("click", function onSaveKey() {
      var key = elements.claudeApiKey ? elements.claudeApiKey.value.trim() : "";
      if (key) {
        localStorage.setItem("gardenHelperApiKey", key);
        if (elements.claudeApiStatus) {
          elements.claudeApiStatus.textContent = "저장 완료";
          elements.claudeApiStatus.className = "api-status-badge api-status-ok";
        }
      } else {
        localStorage.removeItem("gardenHelperApiKey");
        if (elements.claudeApiStatus) {
          elements.claudeApiStatus.textContent = "";
          elements.claudeApiStatus.className = "api-status-badge";
        }
      }
    });
  }

  attachDropAndPasteHandlers();
  renderPositionOptions();
  renderDiceEditor();
  renderBoardEditor();
  solveAndRender();
})();
