import { Cable, CheckSquare, ClipboardList, FileUp, LifeBuoy, type LucideIcon, PieChart } from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "2ndlook",
    items: [
      {
        title: "Connect",
        url: "/dashboard/connect",
        icon: Cable,
      },
      {
        title: "Supported after onboarding",
        url: "/dashboard/supported",
        icon: LifeBuoy,
      },
      {
        title: "Import",
        url: "/dashboard/import",
        icon: FileUp,
      },
      {
        title: "Review",
        url: "/dashboard/review",
        icon: ClipboardList,
      },
      {
        title: "Snapshots",
        url: "/dashboard/snapshots",
        icon: PieChart,
      },
      {
        title: "Next Steps",
        url: "/dashboard/next-steps",
        icon: CheckSquare,
      },
    ],
  },
];
