import { useState } from "react";
import type { ActivityType, Template as TemplateType } from "../tauri";
import { deriveDarkFill } from "../tauri";

interface SidebarProps {
  templates: TemplateType[];
  activityTypes: ActivityType[];
  collapsed: boolean;
  theme: "system" | "light" | "dark";
  onToggle: () => void;
  onTemplateDragStart: (e: React.MouseEvent, template: TemplateType) => void;
  onDeleteTemplate: (id: number) => void;
  onAddTemplate: () => void;
  onUpdateTemplate: (
    id: number,
    name: string,
    markdown: string,
    activityTypeId: number,
  ) => void;
  onCreateActivityType: (name: string) => void;
  onDeleteActivityType: (id: number) => void;
}

export default function Sidebar({
  templates,
  activityTypes,
  collapsed,
  theme,
  onToggle,
  onTemplateDragStart,
  onDeleteTemplate,
  onAddTemplate,
  onUpdateTemplate,
  onCreateActivityType,
  onDeleteActivityType,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [draftTypeId, setDraftTypeId] = useState<number>(0);
  const [typeDraft, setTypeDraft] = useState("");
  const [addingType, setAddingType] = useState(false);

  const colourFor = (typeId: number): string => {
    const base =
      activityTypes.find((t) => t.id === typeId)?.colour ?? "hsl(0, 0%, 80%)";
    return theme === "dark" ? deriveDarkFill(base) : base;
  };

  const startEdit = (t: TemplateType) => {
    setEditingId(t.id);
    setDraftName(t.name);
    setDraftMarkdown(t.markdown);
    setDraftTypeId(t.activityTypeId);
  };

  const commitEdit = () => {
    if (editingId == null) return;
    const name = draftName.trim() || "Untitled";
    onUpdateTemplate(editingId, name, draftMarkdown, draftTypeId);
    setEditingId(null);
  };

  if (collapsed) {
    return (
      <div className="sidebar-rail" onClick={onToggle} title="Open templates">
        <span className="sidebar-rail__chevron" aria-hidden="true">
          ›
        </span>
      </div>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__title">Templates</span>
        <div className="sidebar__header-actions">
          <button
            type="button"
            className="sidebar__add"
            onClick={onAddTemplate}
            title="Add template"
            aria-label="Add template"
          >
            +
          </button>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={onToggle}
            title="Collapse"
            aria-label="Collapse templates"
          >
            ‹
          </button>
        </div>
      </div>

      <div className="sidebar__list">
        {templates.length === 0 ? (
          <div className="sidebar__empty">No templates yet</div>
        ) : (
          templates.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="template template--editing">
                <input
                  className="template__input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Template name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <textarea
                  className="template__textarea"
                  value={draftMarkdown}
                  onChange={(e) => setDraftMarkdown(e.target.value)}
                  placeholder="Markdown"
                  rows={3}
                />
                <div className="template__edit-row">
                  <select
                    className="template__select"
                    value={draftTypeId}
                    onChange={(e) => setDraftTypeId(Number(e.target.value))}
                  >
                    {activityTypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="template__edit-actions">
                  <button
                    type="button"
                    className="template__save"
                    onClick={commitEdit}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="template__cancel"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={t.id}
                className="template"
                style={{ background: colourFor(t.activityTypeId) }}
                onMouseDown={(e) => onTemplateDragStart(e, t)}
                onDoubleClick={() => startEdit(t)}
                title={`${t.name} — drag to add, double-click to edit`}
              >
                <span
                  className="template__dot"
                  style={{ background: colourFor(t.activityTypeId) }}
                  aria-hidden="true"
                />
                <span className="template__name">{t.name}</span>
                <button
                  type="button"
                  className="template__delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTemplate(t.id);
                  }}
                  title="Delete template"
                  aria-label={`Delete template ${t.name}`}
                >
                  ×
                </button>
              </div>
            ),
          )
        )}
      </div>

      <div className="sidebar__types">
        <div className="sidebar__types-header">
          <span className="sidebar__title">Activity types</span>
          <button
            type="button"
            className="sidebar__add"
            onClick={() => setAddingType((v) => !v)}
            title="Add activity type"
            aria-label="Add activity type"
          >
            +
          </button>
        </div>
        {addingType && (
          <div className="sidebar__type-add">
            <input
              className="template__input"
              value={typeDraft}
              onChange={(e) => setTypeDraft(e.target.value)}
              placeholder="Type name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && typeDraft.trim()) {
                  onCreateActivityType(typeDraft.trim());
                  setTypeDraft("");
                  setAddingType(false);
                }
                if (e.key === "Escape") {
                  setTypeDraft("");
                  setAddingType(false);
                }
              }}
            />
          </div>
        )}
        <div className="sidebar__type-list">
          {activityTypes.map((t) => (
            <div key={t.id} className="sidebar__type">
              <span
                className="template__dot"
                style={{ background: theme === "dark" ? deriveDarkFill(t.colour) : t.colour }}
                aria-hidden="true"
              />
              <span className="sidebar__type-name">{t.name}</span>
              <button
                type="button"
                className="template__delete"
                onClick={() => onDeleteActivityType(t.id)}
                title="Delete activity type"
                aria-label={`Delete activity type ${t.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
