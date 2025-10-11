// 要素の取得
const nameInput = document.getElementById("nameInput");
const youtubeInput = document.getElementById("youtubeInput");
const xInput = document.getElementById("xInput");
const tagsInput = document.getElementById("tagsInput");
const favoriteInput = document.getElementById("favoriteInput");
const entryForm = document.getElementById("entryForm");
const entryList = document.getElementById("entryList");
const messageArea = document.getElementById("messageArea");

const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const uploadCsvInput = document.getElementById("uploadCsvInput");

// データの初期化
let data = JSON.parse(localStorage.getItem("userData")) || {};

// メッセージ表示
function showMessage(text) {
  messageArea.textContent = text;
  messageArea.style.display = "block";
  setTimeout(() => {
    messageArea.style.display = "none";
  }, 3000);
}

// 登録済み一覧の表示
function renderList() {
  entryList.innerHTML = "";
  Object.keys(data).forEach(name => {
    const li = document.createElement("li");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = data[name].favorite ? `★ ${name}` : name;
    nameSpan.onclick = () => {
      nameInput.value = name;
      youtubeInput.value = data[name].youtube || "";
      xInput.value = data[name].x || "";
      tagsInput.value = (data[name].tags || []).join(",");
      favoriteInput.checked = !!data[name].favorite;
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "削除";
    deleteBtn.onclick = () => {
      if (confirm(`${name} を削除しますか？`)) {
        delete data[name];
        localStorage.setItem("userData", JSON.stringify(data));
        renderList();
        showMessage(`「${name}」を削除しました`);
      }
    };

    li.appendChild(nameSpan);
    li.appendChild(deleteBtn);
    entryList.appendChild(li);
  });
}

// 登録・更新処理
entryForm.onsubmit = (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  const tags = tagsInput.value.split(",").map(tag => tag.trim()).filter(tag => tag);
  const favorite = favoriteInput.checked;

  data[name] = {
    youtube: youtubeInput.value.trim(),
    x: xInput.value.trim(),
    tags: tags,
    favorite: favorite
  };

  localStorage.setItem("userData", JSON.stringify(data));
  renderList();
  entryForm.reset();
  showMessage(`「${name}」を保存しました`);
};

// CSVダウンロード処理
downloadCsvBtn.onclick = () => {
  const headers = ["name", "youtube", "x", "tags", "favorite"];
  const rows = Object.entries(data).map(([name, info]) => {
    return [
      `"${name}"`,
      `"${info.youtube || ""}"`,
      `"${info.x || ""}"`,
      `"${(info.tags || []).join(",")}"`,
      info.favorite ? "true" : "false"
    ].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "userData.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showMessage("CSVファイルをダウンロードしました");
};

// CSVアップロード処理
uploadCsvInput.onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split("\n").map(line => line.trim()).filter(line => line);
    const [headerLine, ...dataLines] = lines;
    const headers = headerLine.split(",").map(h => h.replace(/"/g, ""));
    const newData = {};

    dataLines.forEach(line => {
      const values = line.split(",").map(v => v.replace(/"/g, ""));
      const entry = {};
      headers.forEach((key, i) => {
        if (key === "name") return;
        if (key === "tags") {
          entry[key] = values[i] ? values[i].split(",").map(t => t.trim()) : [];
        } else if (key === "favorite") {
          entry[key] = values[i] === "true";
        } else {
          entry[key] = values[i] || "";
        }
      });
      newData[values[headers.indexOf("name")]] = entry;
    });

    data = newData;
    localStorage.setItem("userData", JSON.stringify(data));
    renderList();
    showMessage("CSVファイルから登録データを読み込みました");
  };
  reader.readAsText(file);
};

// 初期表示
renderList();
