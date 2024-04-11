import React from "react";
import Editor from "@monaco-editor/react";

const EditorPage = () => {
  return (
    <div className="editor-container">
      <Editor
      height="90%"
      width="90%"
        // theme="vs-dark"
        defaultLanguage="javascript"
        defaultValue="// some comment"
      />
    </div>
  );
};

export default EditorPage;
