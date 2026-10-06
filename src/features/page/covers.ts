/**
 * Cover presets. Covers are stored by id so the gradients can be refined
 * later without migrating saved pages. Mesh-like gradients are layered
 * radial gradients — cheap to render and resolution independent.
 */
export const COVERS: Record<string, string> = {
  iris: 'radial-gradient(at 15% 30%, #b9afff 0, transparent 55%), radial-gradient(at 85% 20%, #ffc8e4 0, transparent 50%), radial-gradient(at 60% 90%, #ffe2b8 0, transparent 55%), #e8e3ff',
  lagoon: 'radial-gradient(at 20% 80%, #9be7ff 0, transparent 55%), radial-gradient(at 80% 20%, #a7f3d0 0, transparent 50%), radial-gradient(at 50% 50%, #c7d2fe 0, transparent 60%), #dbeafe',
  dusk: 'radial-gradient(at 10% 10%, #fda4af 0, transparent 50%), radial-gradient(at 90% 30%, #c4b5fd 0, transparent 55%), radial-gradient(at 40% 100%, #fcd34d 0, transparent 55%), #fbcfe8',
  meadow: 'radial-gradient(at 25% 25%, #bbf7d0 0, transparent 55%), radial-gradient(at 85% 70%, #fef08a 0, transparent 50%), #d9f99d',
  ember: 'radial-gradient(at 20% 30%, #fdba74 0, transparent 55%), radial-gradient(at 80% 80%, #f87171 0, transparent 50%), radial-gradient(at 70% 10%, #fde68a 0, transparent 50%), #fecaca',
  graphite: 'radial-gradient(at 20% 20%, #4b5563 0, transparent 55%), radial-gradient(at 80% 80%, #6d28d9 0, transparent 55%), #1f2937',
  paper: 'linear-gradient(135deg, #f5f1e8 0%, #ece4d4 100%)',
  aurora: 'linear-gradient(120deg, #c9c2ff 0%, #f6d4e8 50%, #ffe7c2 100%)',
};

export const COVER_IDS = Object.keys(COVERS);
