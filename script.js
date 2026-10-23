(function() {
        "use strict";
        const state = { groups: [], criteria: [], activeGroup: 0, draft: null, token: "", gate: null, requestPending: false, toastTimer: 0 };
        const DRAFT_KEY = "dorm-score-draft-v1";
        const $ = function(id) { return document.getElementById(id); };

        function apiCall(action, data) {
          return fetch("/api/gas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.assign({ action: action }, data || {}))
          }).then(function(response) {
            return response.json().then(function(body) {
              if (!response.ok || !body.ok) throw new Error(body.error || "API trả về lỗi.");
              return body.result;
            });
          }).catch(function(error) {
            if (error instanceof SyntaxError) throw new Error("API trả về dữ liệu không hợp lệ.");
            throw error;
          });
        }

        function emptyDraft() {
          const records = {};
          state.groups.forEach(function(group) {
            group.rooms.forEach(function(room) {
              const scores = {};
              state.criteria.forEach(function(item) { scores[item.id] = ""; });
              records[room] = { scores: scores, note: "" };
            });
          });
          return { week: "", fromDate: "", toDate: "", teacher: "", leader: "", records: records };
        }

        function loadDraft() {
          try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return emptyDraft();
            const saved = JSON.parse(raw);
            const draft = emptyDraft();
            ["week", "fromDate", "toDate", "teacher", "leader"].forEach(function(key) {
              if (typeof saved[key] === "string") draft[key] = saved[key];
            });
            Object.keys(draft.records).forEach(function(room) {
              const previous = saved.records && saved.records[room];
              if (!previous) return;
              state.criteria.forEach(function(item) {
                const value = previous.scores && previous.scores[item.id];
                if (typeof value === "string" || typeof value === "number") draft.records[room].scores[item.id] = String(value);
              });
              if (typeof previous.note === "string") draft.records[room].note = previous.note;
            });
            return draft;
          } catch (error) {
            showToast("Không đọc được bản nháp trên thiết bị: " + error.message, true);
            return emptyDraft();
          }
        }

        function persistDraft() {
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
          } catch (error) {
            showToast("Không thể lưu bản nháp trên thiết bị. Hãy kiểm tra dung lượng trình duyệt: " + error.message, true);
          }
        }

        function start() {
          state.token = sessionStorage.getItem("dorm-score-token") || "";
          apiCall("getAppState", { token: state.token }).then(function(data) {
            state.groups = data.groups;
            state.criteria = data.criteria;
            state.draft = loadDraft();
            fillMetaFields();
            buildTabs();
            renderGroup();
            updateProgress();
            $("app").hidden = true;
            applyGate(data.gate);
            window.setInterval(refreshGate, 20000);
            window.setInterval(updateClocks, 1000);
            bindEvents();
          }).catch(showFatal);
        }

        function buildTabs() {
          $("tabs").innerHTML = state.groups.map(function(group, index) {
            return '<button class="tab' + (index === state.activeGroup ? ' active' : '') + '" type="button" data-group="' + index + '">' + escapeHtml(group.name) + '</button>';
          }).join("");
        }

        function renderGroup() {
          const group = state.groups[state.activeGroup];
          $("activeGroupName").textContent = group.name;
          $("activeGroupHint").textContent = group.rooms.length + " phòng · nhập điểm hoặc ghi “chưa chấm” cho từng tiêu chí.";
          $("roomList").innerHTML = group.rooms.map(function(room) {
            const number = room.match(/^\d+/)[0];
            const criteria = state.criteria.map(function(item) {
              const value = state.draft.records[room].scores[item.id];
              return '<div class="criterion"><div class="criterion-label"><strong>' + escapeHtml(item.id) + '</strong>' + escapeHtml(item.label) + '</div><div class="criterion-entry"><input class="score-input' + (isEntered(value) && !isValidScore(value, item.max) ? ' invalid' : '') + '" type="text" inputmode="text" autocomplete="off" maxlength="60" data-room="' + escapeAttr(room) + '" data-score="' + escapeAttr(item.id) + '" data-max="' + item.max + '" value="' + escapeAttr(value) + '" aria-label="' + escapeAttr("Phòng " + room + ", tiêu chí " + item.id + ": " + item.label) + '" placeholder="Điểm / chưa chấm"><span class="score-hint">/' + item.max + '</span></div></div>';
            }).join("");
            return '<details class="room-card" data-room-card="' + escapeAttr(room) + '"><summary><span class="room-number">P' + escapeHtml(number) + '</span><span class="room-title">Phòng ' + escapeHtml(room.replace(/^\d+[.\s]*/, "")) + '</span><span class="room-progress" data-room-progress="' + escapeAttr(room) + '"></span></summary><div class="room-body"><div class="criteria-list">' + criteria + '</div><div class="note-row"><label for="note-' + number + '">Ghi chú</label><input class="note-input" id="note-' + number + '" data-note="' + escapeAttr(room) + '" maxlength="500" value="' + escapeAttr(state.draft.records[room].note) + '" placeholder="Ghi chú cho phòng này (nếu có)"></div><div class="room-total"><span>Tổng điểm:</span><strong data-total="' + escapeAttr(room) + '">—</strong></div></div></details>';
          }).join("");
          updateRoomProgress();
          updateTotals();
        }

        function fillMetaFields() {
          ["week", "fromDate", "toDate", "teacher", "leader"].forEach(function(key) {
            $(key).value = state.draft[key];
          });
        }

        function updateProgress() {
          let entered = 0;
          let total = 0;
          Object.keys(state.draft.records).forEach(function(room) {
            state.criteria.forEach(function(item) {
              total += 1;
              if (isEntered(state.draft.records[room].scores[item.id])) entered += 1;
            });
          });
          $("progressLabel").textContent = entered + " / " + total + " tiêu chí";
          $("progressFill").style.width = (total ? entered / total * 100 : 0) + "%";
          $("progressTrack").setAttribute("aria-valuemax", String(total));
          $("progressTrack").setAttribute("aria-valuenow", String(entered));
          updateRoomProgress();
          updateSaveButton();
        }

        function updateRoomProgress() {
          document.querySelectorAll("[data-room-progress]").forEach(function(element) {
            const room = element.getAttribute("data-room-progress");
            const scores = state.draft.records[room].scores;
            const entered = state.criteria.filter(function(item) { return isEntered(scores[item.id]); }).length;
            element.textContent = entered === state.criteria.length ? "Đã đủ tiêu chí" : entered + "/" + state.criteria.length + " tiêu chí";
            element.classList.toggle("complete", entered === state.criteria.length);
          });
        }

        function updateTotals() {
          document.querySelectorAll("[data-total]").forEach(function(element) {
            const scores = state.draft.records[element.getAttribute("data-total")].scores;
            const values = state.criteria.map(function(item) { return numericValue(scores[item.id]); });
            element.textContent = values.every(function(value) { return value !== null; })
              ? values.reduce(function(sum, value) { return sum + value; }, 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })
              : "Chưa đủ điểm";
          });
        }

        function updateSaveButton() {
          const metaReady = /^(?:[1-9]|[1-4][0-9]|5[0-2])$/.test(state.draft.week)
            && Boolean(state.draft.fromDate && state.draft.toDate && state.draft.teacher.trim())
            && state.draft.fromDate <= state.draft.toDate;
          const allEntered = Object.keys(state.draft.records).every(function(room) {
            return state.criteria.every(function(item) { return isEntered(state.draft.records[room].scores[item.id]); });
          });
          const allValid = Object.keys(state.draft.records).every(function(room) {
            return state.criteria.every(function(item) { return isValidScore(state.draft.records[room].scores[item.id], item.max); });
          });
          $("reviewButton").disabled = !(metaReady && allEntered && allValid && !state.requestPending);
          if (!allEntered) $("saveHint").textContent = "Hoàn tất thông tin đợt chấm và 408 tiêu chí để xác nhận lưu một lần.";
          else if (!allValid) $("saveHint").textContent = "Có điểm số ngoài giới hạn hoặc quá 2 chữ số thập phân. Hãy sửa các ô được đánh dấu.";
          else if (!metaReady) $("saveHint").textContent = "Điểm đã nhập đủ. Hãy kiểm tra tuần, khoảng ngày và tên người chấm.";
          else $("saveHint").textContent = "Đã đủ thông tin cho 34 phòng. Kiểm tra lại rồi xác nhận lưu.";
        }

        function isEntered(value) {
          return String(value).trim().length > 0;
        }

        function isValidScore(value, max) {
          const text = String(value).trim();
          if (!text) return false;
          if (!/^[+-]?(?:\d+[.,]?\d*|[.,]\d+)$/.test(text)) return text.length <= 60;
          const number = Number(text.replace(",", "."));
          return Number.isFinite(number) && number >= 0 && number <= max && Math.round(number * 100) === number * 100;
        }

        function numericValue(value) {
          const text = String(value).trim();
          if (!/^(?:\d+[.,]?\d*|[.,]\d+)$/.test(text)) return null;
          const number = Number(text.replace(",", "."));
          return Number.isFinite(number) ? number : null;
        }

        function bindEvents() {
          $("tabs").addEventListener("click", function(event) {
            const button = event.target.closest("[data-group]");
            if (!button) return;
            state.activeGroup = Number(button.getAttribute("data-group"));
            buildTabs();
            renderGroup();
          });
          $("roomList").addEventListener("input", function(event) {
            const target = event.target;
            const room = target.getAttribute("data-room");
            const criterion = target.getAttribute("data-score");
            const noteRoom = target.getAttribute("data-note");
            if (room && criterion) {
              state.draft.records[room].scores[criterion] = target.value;
              const invalid = isEntered(target.value) && !isValidScore(target.value, Number(target.getAttribute("data-max")));
              target.classList.toggle("invalid", invalid);
              target.setAttribute("aria-invalid", String(invalid));
            }
            else if (noteRoom) state.draft.records[noteRoom].note = target.value;
            persistDraft();
            updateProgress();
            updateTotals();
          });
          ["week", "fromDate", "toDate", "teacher", "leader"].forEach(function(key) {
            $(key).addEventListener("input", function() {
              state.draft[key] = $(key).value;
              persistDraft();
              updateSaveButton();
            });
          });
          $("unlockButton").addEventListener("click", function() {
            $("lockError").textContent = "";
            $("unlockKey").value = "";
            $("unlockDialog").hidden = false;
            window.setTimeout(function() { $("unlockKey").focus(); }, 0);
          });
          $("cancelUnlock").addEventListener("click", function() { $("unlockDialog").hidden = true; });
          $("submitUnlock").addEventListener("click", requestUnlock);
          $("unlockKey").addEventListener("keydown", function(event) { if (event.key === "Enter") requestUnlock(); });
          $("reviewButton").addEventListener("click", openConfirmDialog);
          $("cancelSave").addEventListener("click", function() { $("confirmDialog").hidden = true; });
          $("confirmSave").addEventListener("click", submitScores);
        }

        function applyGate(gate) {
          state.gate = Object.assign({}, gate, { receivedAt: Date.now() });
          $("app").hidden = !gate.open;
          $("lockScreen").hidden = gate.open;
          $("statusText").textContent = gate.scheduled ? "Đang trong giờ nhập" : "Được ủy quyền · 30 phút";
          updateClocks();
        }

        function refreshGate() {
          apiCall("getAppState", { token: state.token }).then(applyGate).catch(function(error) {
            showToast("Không thể kiểm tra trạng thái khóa: " + error.message, true);
          });
        }

        function updateClocks() {
          if (!state.gate) return;
          const serverNow = state.gate.serverNow + (Date.now() - state.gate.receivedAt);
          if (!state.gate.open) {
            $("lockClock").textContent = new Date(serverNow).toLocaleTimeString("vi-VN", { hour12: false });
            return;
          }
          if (state.gate.authorizedUntil && !state.gate.scheduled) {
            const left = Math.max(0, state.gate.authorizedUntil - serverNow);
            const minutes = Math.floor(left / 60000);
            const seconds = Math.floor(left % 60000 / 1000);
            $("statusText").textContent = "Ủy quyền · " + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
          } else {
            $("statusText").textContent = "Đang trong giờ nhập";
          }
        }

        function requestUnlock() {
          const button = $("submitUnlock");
          button.disabled = true;
          button.textContent = "Đang kiểm tra…";
          apiCall("authorizeUnlock", { key: $("unlockKey").value }).then(function(result) {
            button.disabled = false;
            button.textContent = "Xác nhận";
            $("unlockDialog").hidden = true;
            $("unlockKey").value = "";
            if (!result.success) {
              $("lockError").textContent = "Key sai. Liên hệ Khôi Vĩ 10A2 để ủy quyền.";
              return;
            }
            state.token = result.token;
            sessionStorage.setItem("dorm-score-token", result.token);
            state.gate = { open: true, scheduled: false, authorizedUntil: result.expiresAt, serverNow: Date.now(), receivedAt: Date.now() };
            applyGate(state.gate);
            showToast("Đã mở giao diện. Bạn có 30 phút để nhập và lưu dữ liệu.");
          }).catch(function(error) {
            button.disabled = false;
            button.textContent = "Xác nhận";
            $("unlockDialog").hidden = true;
            $("unlockKey").value = "";
            $("lockError").textContent = "Không thể xác thực key: " + error.message;
          });
        }

        function openConfirmDialog() {
          $("confirmSummary").textContent = "Lưu điểm tuần " + state.draft.week + " (" + formatDate(state.draft.fromDate) + " – " + formatDate(state.draft.toDate) + ") cho toàn bộ 34 phòng vào 4 sheet? Sau khi lưu, dữ liệu đã ghi không thể hoàn tác từ giao diện này.";
          $("confirmDialog").hidden = false;
        }

        function submitScores() {
          if (state.requestPending) return;
          state.requestPending = true;
          updateSaveButton();
          $("confirmSave").disabled = true;
          $("confirmSave").textContent = "Đang lưu…";
          const payload = Object.assign({}, state.draft, {
            submissionId: makeSubmissionId(),
            records: state.draft.records
          });
          apiCall("saveScores", { submission: payload, token: state.token }).then(function(result) {
            state.requestPending = false;
            $("confirmDialog").hidden = true;
            $("confirmSave").disabled = false;
            $("confirmSave").textContent = "Lưu lên Google Sheets";
            if (result.success) {
              localStorage.removeItem(DRAFT_KEY);
              state.draft = emptyDraft();
              fillMetaFields();
              renderGroup();
              updateProgress();
              showToast(result.duplicate ? "Lần chấm này đã được lưu trước đó." : "Đã lưu thành công điểm của 34 phòng vào Google Sheets.");
            }
          }).catch(function(error) {
            state.requestPending = false;
            $("confirmSave").disabled = false;
            $("confirmSave").textContent = "Lưu lên Google Sheets";
            updateSaveButton();
            showToast("Lưu dữ liệu thất bại: " + error.message + " Bản nháp vẫn được giữ trên thiết bị.", true);
          });
        }

        function makeSubmissionId() {
          if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
          return "submission-" + Date.now() + "-" + Math.random().toString(36).slice(2, 14);
        }

        function formatDate(value) {
          const parts = value.split("-");
          return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : value;
        }

        function showToast(message, isError) {
          const toast = $("toast");
          toast.textContent = message;
          toast.classList.toggle("error", Boolean(isError));
          toast.hidden = false;
          window.clearTimeout(state.toastTimer);
          state.toastTimer = window.setTimeout(function() { toast.hidden = true; }, 6000);
        }

        function showFatal(error) {
          $("app").hidden = true;
          $("lockScreen").hidden = true;
          $("fatalMessage").textContent = error && error.message ? error.message : String(error);
          $("fatal").hidden = false;
        }

        function escapeHtml(value) {
          return String(value).replace(/[&<>"']/g, function(character) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
          });
        }

        function escapeAttr(value) {
          return escapeHtml(value);
        }

        window.setInterval(function() {
          if (state.gate && state.gate.open && state.gate.authorizedUntil && Date.now() >= state.gate.authorizedUntil) refreshGate();
        }, 1000);
        start();
      })();
