// Matches the desktop visualizer's picker: searchable genre fields show an
// alphabetical two-column list, while ordinary settings keep a compact menu.
import { matchesGenreQuery } from "./genre-options.mjs";

const pickers = new WeakMap();
let opened = null;
export function closeSelectPicker() { opened?.close(); }

class SelectPicker {
  constructor(select) {
    this.select = select;
    this.searchable = select.hasAttribute("data-searchable");
    this.wrapper = document.createElement("span");
    this.wrapper.className = "select-picker";
    this.button = document.createElement(this.searchable ? "input" : "button");
    this.button.type = this.searchable ? "search" : "button";
    this.button.id = select.id + "-button";
    this.button.className = "select-button";
    this.button.setAttribute("role", "combobox");
    this.button.setAttribute("aria-haspopup", "listbox");
    this.button.setAttribute("aria-expanded", "false");
    const label = select.getAttribute("aria-label") || [...select.labels].map(x => x.querySelector("p, span")?.textContent || x.textContent).join(" ").trim();
    this.button.setAttribute("aria-label", label);
    this.value = document.createElement("span");
    this.value.className = "select-value";
    if (!this.searchable) {
      this.button.append(this.value);
      this.button.insertAdjacentHTML("beforeend", '<img class="select-chevron ui-icon" src="../assets/material-symbols/expand_more.svg" alt="">');
    }
    this.menu = document.createElement("div");
    this.menu.id = select.id + "-menu";
    this.menu.className = "select-menu" + (this.searchable ? " genre-select-menu" : "");
    this.menu.setAttribute("role", "listbox");
    this.menu.setAttribute("aria-label", label);
    this.menu.setAttribute("popover", "manual");
    this.button.setAttribute("aria-controls", this.menu.id);
    this.optionsHost = document.createElement("div");
    this.optionsHost.className = "select-options";
    if (this.searchable) {
      this.optionsHost.id = select.id + "-options";
      this.search = this.button;
      this.search.classList.add("genre-select-search");
      this.search.setAttribute("role", "combobox");
      this.search.setAttribute("aria-autocomplete", "list");
      this.search.setAttribute("aria-controls", this.menu.id);
      this.search.setAttribute("aria-expanded", "false");
      this.empty = document.createElement("div");
      this.empty.className = "select-empty";
      this.empty.setAttribute("role", "status");
      this.menu.append(this.optionsHost, this.empty);
      this.search.addEventListener("input", () => {
        if (opened !== this) this.open(this.search.value);
        this.filter(); this.position();
      });
      this.search.addEventListener("keydown", event => this.searchKeydown(event));
    } else {
      this.menu.append(this.optionsHost);
    }
    select.before(this.wrapper);
    this.wrapper.append(select, this.button, this.menu);
    select.hidden = true;
    this.button.addEventListener("click", () => {
      if (this.searchable) { if (opened !== this) this.open(); }
      else opened === this ? this.close() : this.open();
    });
    if (!this.searchable) this.button.addEventListener("keydown", event => this.keydown(event));
    this.menu.addEventListener("pointerdown", event => {
      if (event.target.closest("[role=option]")) event.preventDefault();
    });
    this.menu.addEventListener("click", event => {
      const item = event.target.closest("[role=option]");
      if (item && item.getAttribute("aria-disabled") !== "true") this.choose(Number(item.dataset.index));
    });
    select.addEventListener("change", () => this.update());
    this.update();
  }
  optionElements() { return [...this.optionsHost.children]; }
  visibleIndices() {
    return this.optionElements().filter(item => !item.hidden && item.getAttribute("aria-disabled") !== "true").map(item => Number(item.dataset.index));
  }
  update() {
    this.button.disabled = this.select.disabled;
    this.value.textContent = this.select.selectedOptions[0]?.textContent || "—";
    this.button.title = this.value.textContent;
    if (this.search) {
      if (opened !== this) this.search.value = this.select.value && this.select.value !== "neutral" ? this.value.textContent : "";
      this.search.placeholder = this.select.dataset.searchPlaceholder || "Search";
      this.empty.textContent = this.select.dataset.emptyText || "No matching genres";
    }
    const signature = [...this.select.options].map(option => [option.value, option.textContent, option.dataset.parent || "", option.disabled]);
    const key = JSON.stringify(signature);
    if (this.key !== key) {
      this.key = key;
      this.optionsHost.replaceChildren(...signature.map(([value, text, parent, disabled], index) => {
        const item = document.createElement("div");
        item.className = "select-option";
        item.id = `${this.select.id}-option-${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-disabled", String(disabled));
        item.dataset.index = index;
        const label = document.createElement("span");
        label.textContent = text;
        item.append(label);
        if (this.searchable && parent) {
          const category = document.createElement("small");
          category.textContent = parent;
          item.append(category);
        }
        return item;
      }));
      this.active = this.select.selectedIndex;
      this.filter();
    }
    for (const [index, item] of this.optionElements().entries()) item.setAttribute("aria-selected", String(index === this.select.selectedIndex));
    if (opened === this) {
      if (this.select.disabled || !this.button.isConnected) this.close();
      else { this.position(); this.highlight(this.active); }
    }
  }
  filter() {
    const query = opened === this ? this.search?.value || "" : "";
    for (const item of this.optionElements()) {
      const source = this.select.options[Number(item.dataset.index)];
      item.hidden = !matchesGenreQuery(`${source?.textContent || ""} ${source?.dataset.parent || ""}`, query);
    }
    const visible = this.visibleIndices();
    if (this.empty) this.empty.hidden = Boolean(visible.length);
    if (!visible.includes(this.active)) this.active = visible[0] ?? -1;
    this.highlight(this.active, false);
  }
  position() {
    const r = this.button.getBoundingClientRect(), gutter = 8;
    const width = Math.min(innerWidth - gutter * 2, Math.max(r.width, Math.min(this.searchable ? 430 : 340, this.menu.scrollWidth)));
    this.menu.style.width = width + "px";
    this.menu.style.left = Math.max(gutter, Math.min(r.right - width, innerWidth - width - gutter)) + "px";
    const below = innerHeight - r.bottom - gutter - 6, above = r.top - gutter - 6;
    const desired = this.searchable ? 360 : 300;
    const upwards = below < Math.min(desired, this.menu.scrollHeight) && above > below;
    const height = Math.max(64, Math.min(desired, upwards ? above : below));
    this.menu.style.maxHeight = height + "px";
    this.menu.style.top = (upwards ? r.top - Math.min(this.menu.scrollHeight, height) - 6 : r.bottom + 6) + "px";
  }
  open(seed = "") {
    if (this.select.disabled) return;
    closeSelectPicker();
    opened = this;
    this.update();
    this.menu.showPopover();
    this.button.setAttribute("aria-expanded", "true");
    if (this.search) {
      this.search.setAttribute("aria-expanded", "true");
      this.search.value = seed;
      this.filter();
      this.search.focus({ preventScroll: true });
    } else {
      this.button.focus({ preventScroll: true });
    }
    this.position();
    const selected = this.select.selectedIndex;
    this.highlight(this.visibleIndices().includes(selected) ? selected : this.visibleIndices()[0] ?? -1);
  }
  close() {
    if (this.menu.matches(":popover-open")) this.menu.hidePopover();
    this.button.setAttribute("aria-expanded", "false");
    if (this.search) { this.search.value = ""; this.filter(); }
    this.button.removeAttribute("aria-activedescendant");
    this.search?.removeAttribute("aria-activedescendant");
    this.search?.setAttribute("aria-expanded", "false");
    this.prefix = "";
    if (opened === this) opened = null;
    if (this.search) this.search.value = this.select.value && this.select.value !== "neutral" ? this.select.selectedOptions[0]?.textContent || "" : "";
  }
  highlight(index, scroll = true) {
    const options = this.optionElements();
    this.active = index;
    options.forEach(item => item.classList.toggle("is-active", Number(item.dataset.index) === index));
    const item = options.find(option => Number(option.dataset.index) === index);
    const focusOwner = this.search || this.button;
    if (item && opened === this) {
      focusOwner.setAttribute("aria-activedescendant", item.id);
      if (scroll) item.scrollIntoView({ block: "nearest" });
    } else {
      focusOwner.removeAttribute("aria-activedescendant");
    }
  }
  move(key) {
    const enabled = this.visibleIndices();
    if (!enabled.length) return;
    const position = enabled.indexOf(this.active);
    const next = key === "Home" ? 0 : key === "End" ? enabled.length - 1 : Math.max(0, Math.min(enabled.length - 1, position + (key === "ArrowDown" ? 1 : -1)));
    this.highlight(enabled[next]);
  }
  choose(index) {
    if (index < 0) return;
    this.select.selectedIndex = index;
    this.close();
    this.update();
    this.button.focus({ preventScroll: true });
    this.select.dispatchEvent(new Event("input", { bubbles: true }));
    this.select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  searchKeydown(event) {
    event.stopPropagation();
    if (event.key === "Tab") { this.close(); return; }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); if (opened !== this) this.open(); else this.move(event.key); }
    else if (event.key === "Enter" && opened === this) { event.preventDefault(); this.choose(this.active); }
  }
  keydown(event) {
    const key = event.key;
    if (key === "Tab") { this.close(); return; }
    event.stopPropagation();
    if (key === "Escape") { event.preventDefault(); this.close(); this.button.focus({ preventScroll: true }); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) {
      event.preventDefault();
      if (opened !== this) { this.open(); return; }
      if (key === "Enter" || key === " ") { this.choose(this.active); return; }
      this.move(key);
    } else if (key.length === 1) {
      event.preventDefault();
      if (this.searchable) { this.open(key); return; }
      if (opened !== this) this.open();
      this.prefix = performance.now() - (this.typedAt || 0) > 650 ? key : (this.prefix || "") + key;
      this.typedAt = performance.now();
      const index = [...this.select.options].findIndex(option => !option.disabled && option.textContent.trim().toLocaleLowerCase().startsWith(this.prefix.toLocaleLowerCase()));
      if (index >= 0) this.highlight(index);
    }
  }
}

export function updateSelectPickers(root = document) {
  for (const select of root.querySelectorAll("select")) {
    let picker = pickers.get(select);
    if (!picker) { picker = new SelectPicker(select); pickers.set(select, picker); }
    else picker.update();
  }
}
document.addEventListener("pointerdown", event => {
  if (opened && !opened.wrapper.contains(event.target)) closeSelectPicker();
});
document.addEventListener("focusin", event => {
  if (opened && !opened.wrapper.contains(event.target)) closeSelectPicker();
});
document.addEventListener("scroll", event => {
  if (opened && !opened.menu.contains(event.target)) closeSelectPicker();
}, true);
window.addEventListener("resize", closeSelectPicker);
document.addEventListener("close", closeSelectPicker, true);
