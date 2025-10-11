const nameList = document.getElementById("nameList");
const selectedList = document.getElementById("selectedList");
const outputArea = document.getElementById("outputArea");
const copyBtn = document.getElementById("copyBtn");
const copyMessage = document.getElementById("copyMessage");
const searchInput = document.getElementById("searchInput");
const sortOrder = document.getElementById("sortOrder");
const tagFilter = document.getElementById("tagFilter");
const favoriteOnly = document.getElementById("favoriteOnly");

const nameData = JSON.parse(localStorage.getItem("userData")) || {};

// タグ一覧を抽出して表示
function populateTagFilter() {
  const tags = new Set();
  Object.values(nameData).forEach(entry => {
    (entry.tags || []).forEach(tag => tags.add(tag));
  });
  tagFilter.innerHTML = '<option value="">すべて</option>';
  [...tags].sort().forEach(tag => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    tagFilter.appendChild(option);
  });
}

// 登録名一覧の表示（フィルター・並び順対応）
function renderNameList(filter = "") {
  nameList.innerHTML = "";

  let names = Object.keys(nameData);

  const selectedTag = tagFilter.value;
  if (selectedTag) {
    names = names.filter(name => (nameData[name].tags || []).includes(selectedTag));
  }

  if (favoriteOnly.checked) {
    names = names.filter(name => nameData[name].favorite);
  }

  if (filter) {
    names = names.filter(name => name.includes(filter));
  }

  names.sort((a, b) => sortOrder.value === "asc" ? a.localeCompare(b) : b.localeCompare(a));

  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = nameData[name].favorite ? `★ ${name}` : name;
    nameList.appendChild(option);
  });
}

// イベントリスナー
searchInput.addEventListener("input", () => renderNameList(searchInput.value.trim()));
sortOrder.addEventListener("change", () => renderNameList(searchInput.value.trim()));
tagFilter.addEventListener("change", () => renderNameList(searchInput.value.trim()));
favoriteOnly.addEventListener("change", () => renderNameList(searchInput.value.trim()));

// 初期表示
populateTagFilter();
renderNameList();

// 追加ボタン
document.getElementById("addBtn").onclick = () => {
  const selected = nameList.value;
  if (selected && !Array.from(selectedList.options).some(opt => opt.value === selected)) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = selected;
    selectedList.appendChild(option);
  }
};

// 削除ボタン
document.getElementById("removeBtn").onclick = () => {
  const selected = selectedList.selectedIndex;
  if (selected >= 0) {
    selectedList.remove(selected);
  }
};

// 生成ボタン
document.getElementById("generateBtn").onclick = () => {
  const optBlank = document.getElementById("optBlank").checked;
  const optLabel = document.getElementById("optLabel").checked;
  const optYoutube = document.getElementById("optYoutube").checked;
  const optX = document.getElementById("optX").checked;

  let result = "";
  Array.from(selectedList.options).forEach(opt => {
    const name = opt.value;
    const data = nameData[name];
    result += `${name}\n`;
    if (optYoutube && data.youtube) {
      result += optLabel ? `Youtube: ${data.youtube}\n` : `${data.youtube}\n`;
    }
    if (optX && data.x) {
      result += optLabel ? `X(旧Twitter): ${data.x}\n` : `${data.x}\n`;
    }
    if (optBlank) result += `\n`;
  });

  outputArea.textContent = result.trim();
};

// コピーボタン
copyBtn.onclick = () => {
  const text = outputArea.textContent;
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    copyMessage.textContent = "コピーしました！";
    copyMessage.style.display = "block";
    setTimeout(() => {
      copyMessage.style.display = "none";
    }, 3000);
  });
};
