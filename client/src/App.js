import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import EditorPage from "./components/EditorPage";
import Room from "./components/Room";
import TextEditor from "./components/TextEditor";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />}></Route>
          <Route path="/room" element={<Room />}></Route>
          <Route path="/code-editor/:roomId" element={<EditorPage />}></Route>
          <Route path="/text-editor/:roomId" element={<TextEditor />}></Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App; 