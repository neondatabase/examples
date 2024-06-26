// src/App.jsx

import React, { useState, useEffect } from "react";

function App() {
  const [books, setBooks] = useState([]);
  const [bookName, setBookName] = useState("");
  const [authorName, setAuthorName] = useState("");

  // Function to fetch books
  const fetchBooks = async () => {
    try {
      const response = await fetch("/books");
      const data = await response.json();
      setBooks(data);
    } catch (error) {
      console.error("Error fetching books:", error);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/books/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: bookName, author: authorName }),
      });
      const data = await response.json();

      if (data.success) {
        console.log("Success:", data);
        setBooks([...books, { title: bookName, author: authorName }]);
      } else {
        console.error("Error adding book:", data.error);
      }
    } catch (error) {
      console.error("Error:", error);
    }

    // Reset form fields
    setBookName("");
    setAuthorName("");
  };

  return (
    <div className="App">
      <h1>Book List</h1>
      <ul>
        {books.map((book, index) => (
          <li key={index}>
            {book.title} by {book.author}
          </li>
        ))}
      </ul>

      <h2>Add a Book</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Book Name:
          <input
            type="text"
            value={bookName}
            onChange={(e) => setBookName(e.target.value)}
          />
        </label>
        <label>
          Author Name:
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
          />
        </label>
        <button type="submit">Add Book</button>
      </form>
    </div>
  );
}

export default App;
