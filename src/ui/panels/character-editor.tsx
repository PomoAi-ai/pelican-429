import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { APPEARANCE_COLORS, CHARACTER_PRESETS, FACE_PARAMETERS, HAIR_STYLES, OUTFIT_STYLES, type CharacterAppearance } from '../../config/character-appearance.ts';
import type { GrassyAction } from '../../config/grassy.ts';
import { t } from '../../config/i18n.ts';
import { Dialog } from '../controls/dialog.tsx';
import { Select } from '../controls/select.tsx';
import { Slider } from '../controls/slider.tsx';
import { Switch } from '../controls/switch.tsx';
import { mountReact } from '../react/mount.tsx';
import { useLanguage } from '../react/use-language.ts';
import './character-editor.css';

export interface CharacterPreview {
  applyAppearance(value: CharacterAppearance): void;
  setAction(action: GrassyAction): void;
  setView(view: 'front' | 'side' | 'back' | 'face' | 'game'): void;
  setEquipmentVisible(visible: boolean): void;
  dispose(): void;
}
interface CharacterEditorOptions {
  appearance: CharacterAppearance;
  onApply(value: CharacterAppearance): void | Promise<void>;
  createPreview(parent: HTMLElement, initial: CharacterAppearance, onError: (error: unknown) => void): Promise<CharacterPreview>;
  onClose(): void;
}

/** 外观与视图共享的会话：关闭时外观要同步知道预览实例和是否正在保存。 */
interface Session { preview: CharacterPreview | null; saving: boolean; closed: boolean }

const VIEWS = [['front', '正面'], ['side', '侧面'], ['back', '背面'], ['face', '脸部'], ['game', '游戏视距']] as const;
const ACTIONS: readonly (readonly [GrassyAction, string])[] = [['idle', '待机'], ['run', '跑步'], ['keyboard_smash', '攻击'], ['ride', '骑行'], ['hover', '飞行']];

// 原生 dialog 时就拦下指针按下，避免冒泡到 window 上的游戏监听（如跳过开场取景）。
const stopPointer = (event: PointerEvent): void => event.stopPropagation();

export function openCharacterEditor(options: CharacterEditorOptions) {
  const session: Session = { preview: null, saving: false, closed: false };
  const focusBefore = document.activeElement;
  const host = document.body.appendChild(document.createElement('div'));
  const dispose = (): void => {
    if (session.closed) return;
    session.closed = true;
    session.preview?.dispose();
    unmount();
    host.remove();
    if (focusBefore instanceof HTMLElement) focusBefore.focus();
    options.onClose();
  };
  const close = (): void => { if (!session.saving) dispose(); };
  const unmount = mountReact(host, <CharacterEditor options={options} session={session} close={close} />);
  return { close, dispose };
}

/** 预览画布挂在这个节点上；它在弹窗 Portal 真正挂载后才创建，所以由自己的 effect 启动预览。 */
function PreviewViewport({ start, busy, children }: { start: (parent: HTMLElement) => void; busy: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => start(ref.current!), []);
  return <div ref={ref} className="character-editor-viewport" aria-busy={busy} aria-label={t('角色预览：拖动旋转，滚轮缩放')}>{children}</div>;
}

function CharacterEditor({ options, session, close }: { options: CharacterEditorOptions; session: Session; close: () => void }) {
  const language = useLanguage();
  const [draft, setDraft] = useState(() => structuredClone(options.appearance));
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<GrassyAction>('idle');
  const [equipment, setEquipment] = useState(true);
  const text = (item: { zh: string; en: string }): string => language === 'zh' ? item.zh : item.en;
  const showError = (reason: unknown): void => setError(reason instanceof Error ? reason.message : String(reason));
  const previewError = (reason: unknown): void => { setFailed(true); showError(reason); };
  const change = (next: CharacterAppearance): void => {
    setDraft(next);
    try { session.preview?.applyAppearance(next); }
    catch (reason) { previewError(reason); }
  };
  const start = (parent: HTMLElement): void => {
    void options.createPreview(parent, draft, previewError).then(result => {
      if (session.closed) { result.dispose(); return; }
      session.preview = result; setReady(true);
    }).catch(previewError);
  };
  const apply = async (): Promise<void> => {
    session.saving = true; setSaving(true);
    try {
      await options.onApply(structuredClone(draft));
      session.saving = false;
      close();
    } catch (reason) {
      showError(reason);
      session.saving = false; setSaving(false);
    }
  };
  const forBody = <T extends { id: string }>(items: readonly T[]): T[] => items.filter(item => draft.body === 'male' ? item.id === 'original' : item.id !== 'original');
  const loading = !ready && !failed;
  return (
    // 没有触发按钮，Base UI 只会请求关闭（Esc）；保存中 close 不生效，弹窗保持打开。
    <Dialog open onOpenChange={() => close()} title={t('角色外观')} className="character-editor" disablePointerDismissal>
      <div style={{ display: 'contents' }} onPointerDown={stopPointer}>
        <button type="button" className="character-editor-close" disabled={saving} onClick={close}>{t('关闭 ×')}</button>
        <div className="character-editor-layout">
          <section>
            <PreviewViewport start={start} busy={loading}>
              {loading && <p className="character-editor-loading" role="status">{t('正在加载角色模型…首次打开需要下载模型与贴图，请稍候。')}</p>}
            </PreviewViewport>
            <div className="character-editor-views">
              {VIEWS.map(([id, label]) => <button key={id} type="button" onClick={() => session.preview?.setView(id)}>{t(label)}</button>)}
              <label>{t('动作')}<Select label={t('预览动作')} value={action} items={ACTIONS.map(([value, label]) => ({ value, label: t(label) }))} onValueChange={value => { setAction(value); session.preview?.setAction(value); }} /></label>
              <Switch checked={equipment} onCheckedChange={visible => { setEquipment(visible); session.preview?.setEquipmentVisible(visible); }}>{t('显示装备')}</Switch>
            </div>
          </section>
          <div className="character-editor-form" inert={!ready || saving}>
            <fieldset>
              <legend>{t('角色与预设')}</legend>
              <label>{t('基础外形')}<Select label={t('基础外形')} value={draft.body} items={[{ value: 'male', label: t('男性') }, { value: 'female', label: t('女性') }] as const} onValueChange={body => change(structuredClone(CHARACTER_PRESETS.find(preset => preset.appearance.body === body)!.appearance))} /></label>
              <div className="character-editor-presets">
                {CHARACTER_PRESETS.filter(preset => preset.appearance.body === draft.body).map(preset => (
                  <button key={preset.zh} type="button" onClick={() => change(structuredClone(preset.appearance))}>{text(preset)}</button>
                ))}
              </div>
              <button type="button" onClick={() => {
                const available = CHARACTER_PRESETS.filter(item => item.appearance.body === draft.body);
                const next = structuredClone(available[Math.floor(Math.random() * available.length)]!.appearance);
                for (const { id } of FACE_PARAMETERS) next.face[id] = Math.round((Math.random() - .5) * 40) / 100;
                change(next);
              }}>{t('随机搭配')}</button>
            </fieldset>
            <fieldset>
              <legend>{t('发型与服装')}</legend>
              <label>{t('发型')}<Select label={t('发型')} value={draft.hair} items={forBody(HAIR_STYLES).map(item => ({ value: item.id, label: text(item) }))} onValueChange={hair => change({ ...draft, hair })} /></label>
              <label>{t('服装')}<Select label={t('服装')} value={draft.outfit} items={forBody(OUTFIT_STYLES).map(item => ({ value: item.id, label: text(item) }))} onValueChange={outfit => change({ ...draft, outfit })} /></label>
              {draft.body === 'male' && <p className="character-editor-note">{t('男性保留原版发型与服装，可调整脸部和颜色。')}</p>}
            </fieldset>
            <fieldset>
              <legend>{t('脸部微调')}</legend>
              {FACE_PARAMETERS.map(parameter => (
                <label key={parameter.id}>
                  {text(parameter)}
                  <Slider label={text(parameter)} value={draft.face[parameter.id]} min={-1} max={1} step={.05} onValueChange={value => change({ ...draft, face: { ...draft.face, [parameter.id]: value } })} />
                  <output>{draft.face[parameter.id]}</output>
                </label>
              ))}
              <button type="button" onClick={() => change({ ...draft, face: structuredClone(CHARACTER_PRESETS[0]!.appearance.face) })}>{t('重置脸部')}</button>
            </fieldset>
            <fieldset>
              <legend>{t('颜色')}</legend>
              {APPEARANCE_COLORS.map(item => (
                <label key={item.id}>
                  {text(item)}
                  <input type="color" value={draft.colors[item.id]} onChange={event => change({ ...draft, colors: { ...draft.colors, [item.id]: event.target.value } })} />
                </label>
              ))}
              <button type="button" onClick={() => {
                const preset = CHARACTER_PRESETS.find(item => item.appearance.body === draft.body && item.appearance.outfit === draft.outfit)!;
                change({ ...draft, colors: structuredClone(preset.appearance.colors) });
              }}>{t('重置颜色')}</button>
            </fieldset>
            <button type="button" onClick={() => change(structuredClone(CHARACTER_PRESETS.find(item => item.appearance.body === draft.body)!.appearance))}>{t('恢复该外形默认')}</button>
          </div>
        </div>
        <p className="character-editor-error" role="alert" hidden={error === null}>{error}</p>
        <footer>
          <button type="button" disabled={saving} onClick={close}>{t('取消')}</button>
          <button type="button" className="character-editor-apply" disabled={!ready || failed || saving} onClick={() => void apply()}>{t('应用并保存')}</button>
        </footer>
      </div>
    </Dialog>
  );
}
