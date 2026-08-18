import type { Template as TemplateType } from "../tauri";

interface SidebarProps {
  templates: TemplateType[];
  collapsed: boolean;
  onToggle: () => void;
  onTemplateDragStart: (e: React.DragEvent, template: TemplateType) => void;
}

export default function Sidebar({
  templates,
  collapsed,
  onToggle,
  onTemplateDragStart,
}: SidebarProps) {
  if (collapsed) {
    return (
      <div className="sidebar-rail" onClick={onToggle} title="Open templates">
        ›
      </div>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__title">Templates</span>
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

      <div className="sidebar__list">
        {templates.length === 0 ? (
          <div className="sidebar__empty">No templates yet</div>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="template"
              draggable
              onDragStart={(e) => onTemplateDragStart(e, t)}
              title={t.name}
            >
              {t.name}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
