import { Activity, DatabaseZap, Flame, GitBranch, Map, ShieldAlert } from "lucide-react";

const items = [
  { label: "Operations", icon: Map, active: true },
  { label: "Risk", icon: Flame },
  { label: "Exposure", icon: ShieldAlert },
  { label: "Pipelines", icon: DatabaseZap },
  { label: "Evaluation", icon: Activity },
  { label: "Lineage", icon: GitBranch },
];

export function AppSidebar() {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="brand-mark">AI</div>
      <div className="nav-stack">
        {items.map((item) => (
          <button className={item.active ? "nav-item active" : "nav-item"} key={item.label} aria-label={item.label}>
            <item.icon size={20} />
          </button>
        ))}
      </div>
    </nav>
  );
}

