import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { FileText, NotebookPen, Orbit, Shapes } from 'lucide-react';
import { displayTitle, useWorkspace } from '@/store/workspace';
import type { PageKind } from '@/store/types';
import { KIND_LABEL, PageIcon } from '@/components/ui/PageIcon';
import { riseIn, spring, stagger } from '@/lib/motion';
import './Home.css';

const CREATE: { kind: PageKind; blurb: string; Icon: typeof FileText; tint: string }[] = [
  { kind: 'doc', blurb: 'Write with blocks, slash commands and rich formatting.', Icon: FileText, tint: '#5b4cf0' },
  { kind: 'space', blurb: 'Lay out notes, pages and ideas on an infinite canvas.', Icon: Orbit, tint: '#0090ff' },
  { kind: 'board', blurb: 'Sketch, draw shapes and arrows on a whiteboard.', Icon: Shapes, tint: '#f76b15' },
  { kind: 'notebook', blurb: 'Handwrite on lined, grid or dotted paper.', Icon: NotebookPen, tint: '#30a46c' },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** The "new tab" screen shown when no page is open. */
export function Home() {
  const createPage = useWorkspace((s) => s.createPage);
  const setActive = useWorkspace((s) => s.setActive);
  const recent = useWorkspace(
    useShallow((s) =>
      Object.values(s.pages)
        .filter((p) => !p.trashed)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6),
    ),
  );

  return (
    <div className="home">
      <motion.div className="home__inner" variants={stagger(0.05)} initial="initial" animate="animate">
        <motion.p className="home__eyebrow" variants={riseIn}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </motion.p>
        <motion.h1 className="home__title" variants={riseIn}>
          {greeting()}<em>.</em>
        </motion.h1>
        <motion.p className="home__sub" variants={riseIn}>
          What would you like to think about?
        </motion.p>

        <motion.div className="home__create" variants={stagger(0.04)}>
          {CREATE.map(({ kind, blurb, Icon, tint }) => (
            <motion.button
              key={kind}
              type="button"
              className="home__card"
              variants={riseIn}
              whileHover={{ y: -4, transition: spring.snappy }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActive(createPage(kind))}
              style={{ '--tint': tint } as React.CSSProperties}
            >
              <span className="home__card-icon">
                <Icon width={20} height={20} />
              </span>
              <span className="home__card-title">{KIND_LABEL[kind]}</span>
              <span className="home__card-blurb">{blurb}</span>
            </motion.button>
          ))}
        </motion.div>

        {recent.length > 0 && (
          <motion.section variants={riseIn}>
            <h2 className="home__h2">Recently edited</h2>
            <div className="home__recent">
              {recent.map((p) => (
                <button key={p.id} type="button" className="home__recent-item" onClick={() => setActive(p.id)}>
                  <PageIcon page={p} size={16} />
                  <span className="home__recent-title">{displayTitle(p)}</span>
                  <span className="home__recent-time">{ago(p.updatedAt)}</span>
                </button>
              ))}
            </div>
          </motion.section>
        )}
      </motion.div>
    </div>
  );
}
