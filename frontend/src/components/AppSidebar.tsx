import { Activity, DatabaseZap, Flame, GitBranch, Map, ShieldAlert, type LucideIcon } from "lucide-react";

export type AppSectionId = "operations" | "risk" | "exposure" | "pipelines" | "evaluation" | "lineage";

const items: Array<{ id: AppSectionId; label: string; icon: LucideIcon }> = [
  { id: "operations", label: "Operations", icon: Map },
  { id: "risk", label: "Risk", icon: Flame },
  { id: "exposure", label: "Exposure", icon: ShieldAlert },
  { id: "pipelines", label: "Pipelines", icon: DatabaseZap },
  { id: "evaluation", label: "Evaluation", icon: Activity },
  { id: "lineage", label: "Lineage", icon: GitBranch },
];

interface AppSidebarProps {
  activeSection: AppSectionId;
  onSectionSelect: (section: AppSectionId) => void;
}

export function AppSidebar({ activeSection, onSectionSelect }: AppSidebarProps) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="brand-mark">AI</div>
      <div className="nav-stack">
        {items.map((item) => (
          <a
            className={activeSection === item.id ? "nav-item active" : "nav-item"}
            key={item.id}
            href={`#section-${item.id}`}
            aria-label={`Go to ${item.label}`}
            aria-current={activeSection === item.id ? "page" : undefined}
            data-testid={`nav-${item.id}`}
            onClick={(event) => {
              event.preventDefault();
              onSectionSelect(item.id);
            }}
            title={item.label}
          >
            <item.icon size={20} />
            <span className="nav-label">{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
