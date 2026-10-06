import {
  BookOpen,
  Brain,
  Briefcase,
  Calendar,
  Camera,
  Coffee,
  Compass,
  FileText,
  Flame,
  Flower2,
  Gem,
  Globe,
  GraduationCap,
  Heart,
  Lightbulb,
  ListChecks,
  Moon,
  Music,
  NotebookPen,
  Orbit,
  Palette,
  PenTool,
  Plane,
  Rocket,
  Shapes,
  Sparkles,
  Star,
  Sun,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Page, PageKind } from '@/store/types';

/**
 * Page icons are stored as `{ name, color }` — a *name* rather than the
 * component itself, because React components can't be serialised to
 * IndexedDB. This map turns a stored name back into a component.
 */
export const ICONS: Record<string, LucideIcon> = {
  FileText,
  Sparkles,
  Lightbulb,
  Rocket,
  Target,
  Star,
  Heart,
  Brain,
  BookOpen,
  GraduationCap,
  Briefcase,
  Calendar,
  ListChecks,
  Compass,
  Globe,
  Plane,
  Camera,
  Music,
  Palette,
  PenTool,
  Coffee,
  Flame,
  Flower2,
  Gem,
  Moon,
  Sun,
  Zap,
  Orbit,
  Shapes,
  NotebookPen,
};

export const ICON_COLORS = ['#5b4cf0', '#0090ff', '#30a46c', '#f76b15', '#e5484d', '#d6409f', '#8e4ec6', '#6e6e73'];

export const KIND_ICON: Record<PageKind, LucideIcon> = {
  doc: FileText,
  space: Orbit,
  board: Shapes,
  notebook: NotebookPen,
};

export const KIND_LABEL: Record<PageKind, string> = {
  doc: 'Document',
  space: 'Spatial space',
  board: 'Whiteboard',
  notebook: 'Notebook',
};

interface Props {
  page: Pick<Page, 'icon' | 'kind'>;
  size?: number;
  className?: string;
}

export function PageIcon({ page, size = 16, className }: Props) {
  const Icon = (page.icon && ICONS[page.icon.name]) || KIND_ICON[page.kind];
  return (
    <Icon
      className={className}
      width={size}
      height={size}
      strokeWidth={1.8}
      color={page.icon?.color ?? 'currentColor'}
      aria-hidden="true"
    />
  );
}
