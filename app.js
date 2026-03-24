(function bootstrapApp() {
  "use strict";

  var BOARD_SEGMENTS = { bottom: 11, left: 7, top: 11, right: 7 };

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
    bestSequence: document.getElementById("best-sequence"),
    allResults: document.getElementById("all-results"),
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
    elements.boardEditor.innerHTML = state.board
      .map(function mapTile(tile, index) {
        var isQuestion = tile.type === "question";
        return (
          '<article class="tile-card">' +
          "<h4>발판 " + index + "</h4>" +
          '<div class="tile-card-grid">' +
          '<label>라벨<input type="text" data-tile-index="' + index + '" data-field="label" value="' + escapeHtml(tile.label) + '" /></label>' +
          '<label>발판 타입<select data-tile-index="' + index + '" data-field="type">' + buildOptions(TILE_TYPES, tile.type) + "</select></label>" +
          '<label>비료 값<input type="number" min="-999" max="9999" data-tile-index="' + index + '" data-field="fertilizer" value="' + tile.fertilizer + '" /></label>' +
          '<label>효과<select data-tile-index="' + index + '" data-field="effectType">' + buildOptions(EFFECT_OPTIONS, tile.effectType) + "</select></label>" +
          '<label>효과 수치<input type="number" min="-20" max="20" data-tile-index="' + index + '" data-field="effectValue" value="' + tile.effectValue + '" /></label>' +
          '<label>왼쪽 대상<input type="number" min="0" max="' + (state.board.length - 1) + '" data-tile-index="' + index + '" data-field="leftTarget" value="' + tile.leftTarget + '" ' + (isQuestion ? "" : "disabled") + " /></label>" +
          '<label>오른쪽 대상<input type="number" min="0" max="' + (state.board.length - 1) + '" data-tile-index="' + index + '" data-field="rightTarget" value="' + tile.rightTarget + '" ' + (isQuestion ? "" : "disabled") + " /></label>" +
          '<label>검토 메모<input type="text" disabled value="' + escapeHtml(tile.detectedNote || "자동 탐지 결과") + '" /></label>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
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
      elements.bestSequence.innerHTML = "";
      elements.allResults.innerHTML = "";
      renderWarnings(result.warnings);
      return;
    }

    elements.bestSummary.textContent = "이벤트 UI 영역을 먼저 찾은 뒤 상대좌표로 계산한 결과입니다. 값이 다르면 바로 수정해 주세요.";
    elements.bestSequence.innerHTML = result.bestSequence
      .map(function mapStep(step, index) {
        var line = step.dieLabel + " -> " + step.optionLabel + " -> " + step.tileLabel + " (+" + round(step.immediateGain) + ")";
        if (step.branchMeta) {
          line += " / 좌 기대값 " + round(step.branchMeta.leftExpected) + ", 우 기대값 " + round(step.branchMeta.rightExpected);
        }
        return "<li><strong>" + (index + 1) + "턴</strong> " + escapeHtml(line) + "</li>";
      })
      .join("");

    elements.allResults.innerHTML =
      '<table><thead><tr><th>순위</th><th>주사위 순서</th><th>기대 비료</th><th>주요 경로</th></tr></thead><tbody>' +
      result.allResults.slice(0, 12).map(function mapResult(entry, index) {
        return "<tr><td>" + (index + 1) + "</td><td><span class=\"pill\">" + escapeHtml(entry.order.join(" -> ")) + "</span></td><td>" + entry.expectedFertilizer.toFixed(2) + "</td><td>" + escapeHtml(entry.steps.map(function mapPath(step) { return step.dieLabel + " -> " + step.tileLabel; }).join(" | ")) + "</td></tr>";
      }).join("") +
      "</tbody></table>";

    renderWarnings((state.warnings || []).concat(result.warnings || []));
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
        fertilizer: reward > 0 ? reward : guess.type === "question" ? 0 : 300,
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
      await detectScenario(loaded.image);
    } catch (error) {
      state.warnings = ["이미지 분석에 실패했습니다. 다른 캡처로 다시 시도해 주세요."];
      renderWarnings(state.warnings);
      setDetectionStatus("이미지 분석에 실패했습니다.", "error");
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

  attachDropAndPasteHandlers();
  renderPositionOptions();
  renderDiceEditor();
  renderBoardEditor();
  solveAndRender();
})();
