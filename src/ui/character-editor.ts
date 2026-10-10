import { APPEARANCE_COLORS, CHARACTER_PRESETS, FACE_PARAMETERS, HAIR_STYLES, OUTFIT_STYLES, type CharacterAppearance } from '../config/character-appearance.ts';
import type { GrassyAction } from '../config/grassy.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export interface CharacterPreview {
  applyAppearance(value: CharacterAppearance): void;
  setAction(action: GrassyAction): void;
  setView(view: 'front' | 'side' | 'back' | 'face' | 'game'): void;
  setEquipmentVisible(visible: boolean): void;
  dispose(): void;
}
export interface CharacterEditorOptions {
  appearance: CharacterAppearance;
  onApply(value: CharacterAppearance): void | Promise<void>;
  createPreview(parent: HTMLElement, initial: CharacterAppearance, onError: (error: unknown) => void): Promise<CharacterPreview>;
  onClose(): void;
}

export function openCharacterEditor(options: CharacterEditorOptions) {
  let draft = structuredClone(options.appearance);
  let preview: CharacterPreview | null = null;
  let closed = false;
  let saving = false;
  let previewAction: GrassyAction = 'idle';
  let showEquipment = true;
  const focusBefore = document.activeElement;
  const text = (zh: string, en: string): string => getLanguage() === 'zh' ? zh : en;
  const dialog = document.createElement('dialog');
  dialog.className = 'character-editor';
  dialog.setAttribute('aria-labelledby', 'character-editor-title');
  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.id = 'character-editor-title';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  header.append(title, closeButton);
  const layout = document.createElement('div');
  layout.className = 'character-editor-layout';
  const previewColumn = document.createElement('section');
  const viewport = document.createElement('div');
  viewport.className = 'character-editor-viewport';
  viewport.setAttribute('aria-busy', 'true');
  const loading = document.createElement('p');
  loading.className = 'character-editor-loading';
  loading.setAttribute('role', 'status');
  viewport.append(loading);
  const views = document.createElement('div');
  views.className = 'character-editor-views';
  previewColumn.append(viewport, views);
  const form = document.createElement('div');
  form.className = 'character-editor-form';
  layout.append(previewColumn, form);
  const error = document.createElement('p');
  error.className = 'character-editor-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const footer = document.createElement('footer');
  const cancel = document.createElement('button');
  const apply = document.createElement('button');
  cancel.type = apply.type = 'button';
  apply.className = 'character-editor-apply';
  apply.disabled = true;
  footer.append(cancel, apply);
  dialog.append(header, layout, error, footer);
  document.body.append(dialog);

  const showError = (reason: unknown): void => {
    error.textContent = reason instanceof Error ? reason.message : String(reason);
    error.hidden = false;
  };
  const previewError = (reason: unknown): void => {
    loading.remove(); viewport.setAttribute('aria-busy', 'false');
    showError(reason); apply.disabled = true;
  };
  const dispose = (): void => {
    if (closed) return;
    closed = true;
    unsubscribe();
    preview?.dispose();
    dialog.close();
    dialog.remove();
    if (focusBefore instanceof HTMLElement) focusBefore.focus();
    options.onClose();
  };
  const close = (): void => { if (!saving) dispose(); };
  closeButton.onclick = cancel.onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  for (const event of ['keydown', 'keyup', 'pointerdown']) dialog.addEventListener(event, e => e.stopPropagation());
  apply.onclick = async () => {
    saving = true;
    apply.disabled = closeButton.disabled = cancel.disabled = true;
    form.inert = true;
    try {
      await options.onApply(structuredClone(draft));
      saving = false;
      close();
    } catch (reason) {
      showError(reason);
      saving = false;
      apply.disabled = closeButton.disabled = cancel.disabled = false;
      form.inert = false;
    }
  };

  const update = (): void => {
    try { preview?.applyAppearance(draft); }
    catch (reason) { previewError(reason); }
  };
  const button = (parent: HTMLElement, label: string, action: () => void): HTMLButtonElement => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.onclick = action; parent.append(node); return node;
  };
  const group = (label: string): HTMLFieldSetElement => {
    const node = document.createElement('fieldset'); const legend = document.createElement('legend');
    legend.textContent = label; node.append(legend); form.append(node); return node;
  };
  const select = (parent: HTMLElement, label: string, items: readonly { id: string; zh: string; en: string }[], value: string, change: (value: string) => void): HTMLSelectElement => {
    const row = document.createElement('label'); row.textContent = label;
    const input = document.createElement('select');
    for (const item of items) { const option = document.createElement('option'); option.value = item.id; option.textContent = text(item.zh, item.en); input.append(option); }
    input.value = value; input.onchange = () => change(input.value); row.append(input); parent.append(row); return input;
  };
  const render = (): void => {
    title.textContent = text('角色外观', 'Character appearance');
    loading.textContent = text('正在加载角色模型…首次打开需要下载模型与贴图，请稍候。', 'Loading character models… The first visit downloads models and textures. Please wait.');
    closeButton.textContent = text('关闭 ×', 'Close ×');
    cancel.textContent = text('取消', 'Cancel'); apply.textContent = text('应用并保存', 'Apply & save');
    viewport.setAttribute('aria-label', text('角色预览：拖动旋转，滚轮缩放', 'Character preview: drag to rotate, scroll to zoom'));
    views.replaceChildren();
    for (const [id, zh, en] of [['front', '正面', 'Front'], ['side', '侧面', 'Side'], ['back', '背面', 'Back'], ['face', '脸部', 'Face'], ['game', '游戏视距', 'Game scale']] as const) {
      button(views, text(zh, en), () => preview?.setView(id));
    }
    const action = select(views, text('动作', 'Action'), [
      { id: 'idle', zh: '待机', en: 'Idle' }, { id: 'run', zh: '跑步', en: 'Run' },
      { id: 'keyboard_smash', zh: '攻击', en: 'Attack' }, { id: 'ride', zh: '骑行', en: 'Ride' }, { id: 'hover', zh: '飞行', en: 'Fly' },
    ], previewAction, value => { previewAction = value as GrassyAction; preview?.setAction(previewAction); });
    action.setAttribute('aria-label', text('预览动作', 'Preview animation'));
    const equipment = document.createElement('label');
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = showEquipment;
    toggle.onchange = () => { showEquipment = toggle.checked; preview?.setEquipmentVisible(showEquipment); };
    equipment.append(toggle, text('显示装备', 'Show equipment')); views.append(equipment);
    form.replaceChildren();
    const body = group(text('角色与预设', 'Character & presets'));
    select(body, text('基础外形', 'Body'), [{ id: 'male', zh: '男性', en: 'Male' }, { id: 'female', zh: '女性', en: 'Female' }], draft.body, value => {
      draft = structuredClone(CHARACTER_PRESETS.find(preset => preset.appearance.body === value)!.appearance); update(); render();
    });
    const presets = document.createElement('div'); presets.className = 'character-editor-presets'; body.append(presets);
    for (const preset of CHARACTER_PRESETS.filter(item => item.appearance.body === draft.body)) {
      button(presets, text(preset.zh, preset.en), () => { draft = structuredClone(preset.appearance); update(); render(); });
    }
    button(body, text('随机搭配', 'Randomize'), () => {
      const available = CHARACTER_PRESETS.filter(item => item.appearance.body === draft.body);
      draft = structuredClone(available[Math.floor(Math.random() * available.length)]!.appearance);
      for (const { id } of FACE_PARAMETERS) draft.face[id] = Math.round((Math.random() - .5) * 40) / 100;
      update(); render();
    });
    const style = group(text('发型与服装', 'Hair & outfit'));
    select(style, text('发型', 'Hair'), HAIR_STYLES.filter(item => draft.body === 'male' ? item.id === 'original' : item.id !== 'original'), draft.hair, value => { draft.hair = value as CharacterAppearance['hair']; update(); });
    select(style, text('服装', 'Outfit'), OUTFIT_STYLES.filter(item => draft.body === 'male' ? item.id === 'original' : item.id !== 'original'), draft.outfit, value => { draft.outfit = value as CharacterAppearance['outfit']; update(); });
    if (draft.body === 'male') {
      const note = document.createElement('p'); note.className = 'character-editor-note';
      note.textContent = text('男性保留原版发型与服装，可调整脸部和颜色。', 'Male characters retain the original hair and outfit; face and colors are adjustable.'); style.append(note);
    }
    const face = group(text('脸部微调', 'Face'));
    for (const parameter of FACE_PARAMETERS) {
      const row = document.createElement('label'); row.textContent = text(parameter.zh, parameter.en);
      const range = document.createElement('input'); range.type = 'range'; range.min = '-1'; range.max = '1'; range.step = '.05'; range.value = String(draft.face[parameter.id]);
      const value = document.createElement('output'); value.textContent = range.value;
      range.oninput = () => { draft.face[parameter.id] = range.valueAsNumber; value.textContent = range.value; update(); };
      row.append(range, value); face.append(row);
    }
    button(face, text('重置脸部', 'Reset face'), () => { draft.face = structuredClone(CHARACTER_PRESETS[0]!.appearance.face); update(); render(); });
    const colors = group(text('颜色', 'Colors'));
    for (const item of APPEARANCE_COLORS) {
      const row = document.createElement('label'); row.textContent = text(item.zh, item.en);
      const input = document.createElement('input'); input.type = 'color'; input.value = draft.colors[item.id];
      input.oninput = () => { draft.colors[item.id] = input.value; update(); }; row.append(input); colors.append(row);
    }
    button(colors, text('重置颜色', 'Reset colors'), () => {
      const preset = CHARACTER_PRESETS.find(item => item.appearance.body === draft.body && item.appearance.outfit === draft.outfit)!;
      draft.colors = structuredClone(preset.appearance.colors); update(); render();
    });
    button(form, text('恢复该外形默认', 'Restore body default'), () => {
      draft = structuredClone(CHARACTER_PRESETS.find(item => item.appearance.body === draft.body)!.appearance); update(); render();
    });
  };
  const unsubscribe = onLanguageChange(render);
  render();
  form.inert = true;
  dialog.showModal();
  void options.createPreview(viewport, draft, previewError).then(result => {
    if (closed) { result.dispose(); return; }
    loading.remove(); viewport.setAttribute('aria-busy', 'false');
    preview = result; form.inert = false; apply.disabled = false;
  }).catch(previewError);
  return { close, dispose };
}
