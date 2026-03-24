(function attachGardenSolver(globalScope) {
  "use strict";

  var EFFECT_LABELS = {
    none: "효과 없음",
    flat_bonus: "즉시 비료 획득",
    flat_penalty: "즉시 비료 손실",
    next_roll_bonus: "다음 이동 칸수 증가",
    next_reward_multiplier: "다음 착지 비료 배수",
  };

  var SPECIAL_LABELS = {
    none: "일반 주사위",
    plus_minus_one: "값 -1/기본/+1 중 선택",
    choose_one_to_six: "1~6 자유 선택",
    double_reward: "이번 착지 비료 2배",
    ignore_monster: "이번 착지 몬스터 무시",
    bonus_fertilizer: "즉시 비료 보너스",
  };

  function clampMinimum(value, minimum) {
    return value < minimum ? minimum : value;
  }

  function mod(index, size) {
    if (!size) {
      return 0;
    }
    return ((index % size) + size) % size;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeBoard(board) {
    return (board || []).map(function normalizeTile(tile, index) {
      return {
        id: tile.id || "tile-" + index,
        label: tile.label || "발판 " + (index + 1),
        type: tile.type || "normal",
        fertilizer: Number(tile.fertilizer || 0),
        effectType: tile.effectType || "none",
        effectValue: Number(tile.effectValue || 0),
        leftTarget:
          typeof tile.leftTarget === "number" && Number.isFinite(tile.leftTarget)
            ? tile.leftTarget
            : mod(index - 1, board.length || 1),
        rightTarget:
          typeof tile.rightTarget === "number" && Number.isFinite(tile.rightTarget)
            ? tile.rightTarget
            : mod(index + 1, board.length || 1),
      };
    });
  }

  function normalizeDice(dice) {
    return (dice || []).map(function normalizeDie(die, index) {
      return {
        id: die.id || "die-" + index,
        label: die.label || "주사위 " + (index + 1),
        value: clampMinimum(Number(die.value || 1), 1),
        specialType: die.specialType || "none",
        specialValue: Number(die.specialValue || 0),
      };
    });
  }

  function createInitialState(config) {
    return {
      position: Number(config.currentPosition || 0),
      nextRollBonus: 0,
      nextRewardMultiplier: 1,
    };
  }

  function expandDieOptions(die) {
    var value = clampMinimum(Number(die.value || 1), 1);
    var specialValue = Number(die.specialValue || 0);
    var options = [
      {
        move: value,
        label: "기본 사용",
        rewardMultiplier: 1,
        ignoreMonster: false,
        bonusFertilizer: 0,
      },
    ];

    switch (die.specialType) {
      case "plus_minus_one":
        options = [-1, 0, 1]
          .map(function buildMove(offset) {
            return clampMinimum(value + offset, 1);
          })
          .filter(function uniqueMoves(move, index, list) {
            return list.indexOf(move) === index;
          })
          .map(function toOption(move) {
            var delta = move - value;
            var text = delta === 0 ? "기본" : delta > 0 ? "+" + delta : String(delta);
            return {
              move: move,
              label: "특수효과 사용 (" + text + "칸)",
              rewardMultiplier: 1,
              ignoreMonster: false,
              bonusFertilizer: 0,
            };
          });
        break;
      case "choose_one_to_six":
        options = [1, 2, 3, 4, 5, 6].map(function toOption(move) {
          return {
            move: move,
            label: "특수효과 사용 (" + move + "칸 선택)",
            rewardMultiplier: 1,
            ignoreMonster: false,
            bonusFertilizer: 0,
          };
        });
        break;
      case "double_reward":
        options.push({
          move: value,
          label: "특수효과 사용 (착지 비료 2배)",
          rewardMultiplier: 2,
          ignoreMonster: false,
          bonusFertilizer: 0,
        });
        break;
      case "ignore_monster":
        options.push({
          move: value,
          label: "특수효과 사용 (몬스터 무시)",
          rewardMultiplier: 1,
          ignoreMonster: true,
          bonusFertilizer: 0,
        });
        break;
      case "bonus_fertilizer":
        options.push({
          move: value,
          label: "특수효과 사용 (비료 +" + specialValue + ")",
          rewardMultiplier: 1,
          ignoreMonster: false,
          bonusFertilizer: specialValue,
        });
        break;
      default:
        break;
    }

    return options;
  }

  function applyEffect(nextState, effectType, effectValue) {
    var immediateGain = 0;
    switch (effectType) {
      case "flat_bonus":
        immediateGain += effectValue;
        break;
      case "flat_penalty":
        immediateGain -= effectValue;
        break;
      case "next_roll_bonus":
        nextState.nextRollBonus += effectValue;
        break;
      case "next_reward_multiplier":
        nextState.nextRewardMultiplier *= effectValue || 1;
        break;
      default:
        break;
    }
    return immediateGain;
  }

  function serializeState(state, remainingDice, questionPolicy) {
    var dieKey = remainingDice
      .map(function mapDie(die) {
        return [die.id, die.value, die.specialType, die.specialValue].join(":");
      })
      .sort()
      .join("|");

    return [
      state.position,
      state.nextRollBonus,
      state.nextRewardMultiplier,
      questionPolicy,
      dieKey,
    ].join("~");
  }

  function solveScenario(config) {
    var board = normalizeBoard(config.board || []);
    var dice = normalizeDice(config.dice || []);
    var questionPolicy = config.questionPolicy || "higher";
    var warnings = [];

    if (!board.length) {
      return {
        expectedFertilizer: 0,
        warnings: ["보드가 비어 있어 계산할 수 없어요."],
        bestSequence: [],
        allResults: [],
      };
    }

    if (dice.length !== 3) {
      warnings.push("현재 계산기는 주사위 3개 완전탐색을 기준으로 만들어졌어요.");
    }

    var memo = new Map();

    function search(state, remainingDice) {
      if (!remainingDice.length) {
        return {
          expectedGain: 0,
          steps: [],
        };
      }

      var memoKey = serializeState(state, remainingDice, questionPolicy);
      if (memo.has(memoKey)) {
        return deepClone(memo.get(memoKey));
      }

      var best = {
        expectedGain: Number.NEGATIVE_INFINITY,
        steps: [],
      };

      remainingDice.forEach(function iterateDice(die, dieIndex) {
        var leftoverDice = remainingDice.filter(function keepItem(_, index) {
          return index !== dieIndex;
        });

        expandDieOptions(die).forEach(function evaluateOption(option) {
          var effectiveMove = clampMinimum(option.move + state.nextRollBonus, 1);
          var landedIndex = mod(state.position + effectiveMove, board.length);
          var landedTile = board[landedIndex];
          var nextState = {
            position: landedIndex,
            nextRollBonus: 0,
            nextRewardMultiplier: 1,
          };

          var immediateGain = Number(option.bonusFertilizer || 0);
          var baseReward = Number(landedTile.fertilizer || 0);
          var rewardMultiplier = Number(state.nextRewardMultiplier || 1) * Number(option.rewardMultiplier || 1);
          immediateGain += baseReward * rewardMultiplier;

          var effectApplied = "없음";
          if (landedTile.type === "monster" && option.ignoreMonster) {
            effectApplied = "몬스터 효과 무시";
          } else {
            var delta = applyEffect(nextState, landedTile.effectType, Number(landedTile.effectValue || 0));
            immediateGain += delta;
            if (landedTile.effectType !== "none") {
              effectApplied = EFFECT_LABELS[landedTile.effectType] + " (" + landedTile.effectValue + ")";
            }
          }

          var branchMeta = null;
          var future;

          if (landedTile.type === "question") {
            var leftIndex = mod(landedTile.leftTarget, board.length);
            var rightIndex = mod(landedTile.rightTarget, board.length);

            var leftSearch = search(
              {
                position: leftIndex,
                nextRollBonus: nextState.nextRollBonus,
                nextRewardMultiplier: nextState.nextRewardMultiplier,
              },
              leftoverDice
            );
            var rightSearch = search(
              {
                position: rightIndex,
                nextRollBonus: nextState.nextRollBonus,
                nextRewardMultiplier: nextState.nextRewardMultiplier,
              },
              leftoverDice
            );

            branchMeta = {
              leftIndex: leftIndex,
              rightIndex: rightIndex,
              leftExpected: leftSearch.expectedGain,
              rightExpected: rightSearch.expectedGain,
            };

            if (questionPolicy === "average") {
              future = {
                expectedGain: (leftSearch.expectedGain + rightSearch.expectedGain) / 2,
                steps:
                  leftSearch.expectedGain >= rightSearch.expectedGain
                    ? leftSearch.steps
                    : rightSearch.steps,
              };
            } else {
              future = leftSearch.expectedGain >= rightSearch.expectedGain ? leftSearch : rightSearch;
            }
          } else {
            future = search(nextState, leftoverDice);
          }

          var totalGain = immediateGain + future.expectedGain;
          if (totalGain > best.expectedGain) {
            best = {
              expectedGain: totalGain,
              steps: [
                {
                  dieId: die.id,
                  dieLabel: die.label,
                  baseValue: die.value,
                  specialType: die.specialType,
                  optionLabel: option.label,
                  move: effectiveMove,
                  landedIndex: landedIndex,
                  tileLabel: landedTile.label,
                  tileType: landedTile.type,
                  immediateGain: immediateGain,
                  effectApplied: effectApplied,
                  branchMeta: branchMeta,
                },
              ].concat(future.steps),
            };
          }
        });
      });

      memo.set(memoKey, deepClone(best));
      return best;
    }

    var bestOverall = search(createInitialState(config), dice);
    var allResults = enumerateOrders(config, board);

    return {
      expectedFertilizer: roundTwo(bestOverall.expectedGain),
      bestSequence: bestOverall.steps,
      allResults: allResults,
      warnings: warnings,
    };
  }

  function enumerateOrders(config, board) {
    var dice = normalizeDice(config.dice || []);
    var questionPolicy = config.questionPolicy || "higher";

    function permute(items) {
      if (items.length <= 1) {
        return [items];
      }

      var results = [];
      items.forEach(function pickItem(item, index) {
        var rest = items.slice(0, index).concat(items.slice(index + 1));
        permute(rest).forEach(function pushPermutation(child) {
          results.push([item].concat(child));
        });
      });
      return results;
    }

    function evaluateFixedOrder(order) {
      var memo = new Map();

      function descend(state, stepIndex) {
        if (stepIndex >= order.length) {
          return {
            expectedGain: 0,
            steps: [],
          };
        }

        var memoKey = [
          state.position,
          state.nextRollBonus,
          state.nextRewardMultiplier,
          stepIndex,
        ].join("|");

        if (memo.has(memoKey)) {
          return deepClone(memo.get(memoKey));
        }

        var die = order[stepIndex];
        var best = {
          expectedGain: Number.NEGATIVE_INFINITY,
          steps: [],
        };

        expandDieOptions(die).forEach(function evaluateOption(option) {
          var move = clampMinimum(option.move + state.nextRollBonus, 1);
          var landedIndex = mod(state.position + move, board.length);
          var tile = board[landedIndex];
          var nextState = {
            position: landedIndex,
            nextRollBonus: 0,
            nextRewardMultiplier: 1,
          };

          var gain = Number(option.bonusFertilizer || 0);
          gain += Number(tile.fertilizer || 0) * Number(state.nextRewardMultiplier || 1) * Number(option.rewardMultiplier || 1);
          var effectText = "없음";

          if (tile.type === "monster" && option.ignoreMonster) {
            effectText = "몬스터 효과 무시";
          } else {
            gain += applyEffect(nextState, tile.effectType, Number(tile.effectValue || 0));
            if (tile.effectType !== "none") {
              effectText = EFFECT_LABELS[tile.effectType] + " (" + tile.effectValue + ")";
            }
          }

          var future;
          var branchMeta = null;
          if (tile.type === "question") {
            var leftIndex = mod(tile.leftTarget, board.length);
            var rightIndex = mod(tile.rightTarget, board.length);
            var left = descend(
              {
                position: leftIndex,
                nextRollBonus: nextState.nextRollBonus,
                nextRewardMultiplier: nextState.nextRewardMultiplier,
              },
              stepIndex + 1
            );
            var right = descend(
              {
                position: rightIndex,
                nextRollBonus: nextState.nextRollBonus,
                nextRewardMultiplier: nextState.nextRewardMultiplier,
              },
              stepIndex + 1
            );

            branchMeta = {
              leftIndex: leftIndex,
              rightIndex: rightIndex,
              leftExpected: left.expectedGain,
              rightExpected: right.expectedGain,
            };

            if (questionPolicy === "average") {
              future = {
                expectedGain: (left.expectedGain + right.expectedGain) / 2,
                steps: left.expectedGain >= right.expectedGain ? left.steps : right.steps,
              };
            } else {
              future = left.expectedGain >= right.expectedGain ? left : right;
            }
          } else {
            future = descend(nextState, stepIndex + 1);
          }

          var total = gain + future.expectedGain;
          if (total > best.expectedGain) {
            best = {
              expectedGain: total,
              steps: [
                {
                  dieId: die.id,
                  dieLabel: die.label,
                  optionLabel: option.label,
                  move: move,
                  landedIndex: landedIndex,
                  tileLabel: tile.label,
                  immediateGain: gain,
                  effectApplied: effectText,
                  branchMeta: branchMeta,
                },
              ].concat(future.steps),
            };
          }
        });

        memo.set(memoKey, deepClone(best));
        return best;
      }

      return descend(
        {
          position: Number(config.currentPosition || 0),
          nextRollBonus: 0,
          nextRewardMultiplier: 1,
        },
        0
      );
    }

    return permute(dice)
      .map(function buildOrderResult(order) {
        var evaluation = evaluateFixedOrder(order);
        return {
          order: order.map(function mapDie(die) {
            return die.label;
          }),
          expectedFertilizer: roundTwo(evaluation.expectedGain),
          steps: evaluation.steps,
        };
      })
      .sort(function sortByExpected(a, b) {
        return b.expectedFertilizer - a.expectedFertilizer;
      });
  }

  function roundTwo(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  globalScope.GardenSolver = {
    EFFECT_LABELS: EFFECT_LABELS,
    SPECIAL_LABELS: SPECIAL_LABELS,
    solveScenario: solveScenario,
    normalizeBoard: normalizeBoard,
    normalizeDice: normalizeDice,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = globalScope.GardenSolver;
  }
})(typeof window !== "undefined" ? window : globalThis);
