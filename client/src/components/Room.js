import React, { useEffect, useState } from "react";
import { v4 } from "uuid";

const Room = () => {
  const [inputValue, setInputValue] = useState(""); 

  const createRoom = (e) => {
    e.preventDefault();
    const documentId = v4();
    console.log(documentId);
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Enter" && inputValue.trim() === "") {
        createRoom(e);
      }
    };

    const inputField = document.getElementById("room-uid");
    inputField.addEventListener("keypress", handleKeyPress);

    return () => {
      inputField.removeEventListener("keypress", handleKeyPress);
    };
  }, [createRoom, inputValue]); 

  const handleChange = (e) => {
    setInputValue(e.target.value); 
  };

  return (
    <div id="room">
      <input
        id="room-uid"
        type="text"
        name="room id"
        value={inputValue} 
        placeholder="Enter room id to join"
        onChange={handleChange} 
      />
    </div>
  );
};

export default Room;
