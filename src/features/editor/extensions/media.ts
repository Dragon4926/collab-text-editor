import { Extension } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { readImageFile } from '@/lib/image';

/**
 * Images in documents. TipTap's Image node renders an <img>; this file adds
 * paste and drop support via a ProseMirror plugin.
 *
 * ProseMirror plugins can intercept DOM events through `props.handlePaste`
 * and `props.handleDrop`. Returning `true` tells ProseMirror "handled, don't
 * do your default thing". We downscale the file, then dispatch a transaction
 * that inserts an image node at the cursor (paste) or at the drop point.
 */

export const DocImage = Image.configure({ allowBase64: true, HTMLAttributes: { class: 'doc-image', draggable: 'false' } });

async function insertFiles(view: EditorView, files: File[], pos?: number) {
  for (const file of files) {
    const { src } = await readImageFile(file, 1800);
    const node = view.state.schema.nodes.image.create({ src });
    const at = pos ?? view.state.selection.from;
    view.dispatch(view.state.tr.insert(at, node));
  }
}

export const ImageDrop = Extension.create({
  name: 'imageDrop',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('imageDrop'),
        props: {
          handlePaste(view, event) {
            const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length) return false;
            void insertFiles(view, files);
            return true;
          },
          handleDrop(view, event) {
            const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length) return false;
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            void insertFiles(view, files, pos);
            return true;
          },
        },
      }),
    ];
  },
});

/** Open the OS file picker and insert the chosen images at the cursor. */
export function pickImages(view: EditorView) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => void insertFiles(view, [...(input.files ?? [])]);
  input.click();
}
