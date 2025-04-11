CREATE TABLE IF NOT EXISTS book (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL
);

INSERT INTO book (title, author) VALUES ('The Hobbit', 'J.R.R. Tolkien');
INSERT INTO book (title, author) VALUES ('1984', 'George Orwell');
