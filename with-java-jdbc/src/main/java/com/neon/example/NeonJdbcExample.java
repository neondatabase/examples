package com.neon.example;

import io.github.cdimascio.dotenv.Dotenv;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;

public class NeonJdbcExample {
    
    static class User {
        String name;
        String email;
        String country;
        
        User(String name, String email, String country) {
            this.name = name;
            this.email = email;
            this.country = country;
        }
    }
    
    public static void main(String[] args) {
        // Load environment variables from .env file
        Dotenv dotenv = Dotenv.load();
        String databaseUrl = dotenv.get("DATABASE_URL");
        
        try {
            // Create table
            createTable(databaseUrl);
            
            // Insert records
            insertUser(databaseUrl, "John Doe", "john.doe@example.com", "USA");
            
            List<User> users = Arrays.asList(
                new User("Jane Smith", "jane.smith@example.com", "Canada"),
                new User("Bob Johnson", "bob.johnson@example.com", "UK"),
                new User("Alice Brown", "alice.brown@example.com", "Australia")
            );
            insertMultipleUsers(databaseUrl, users);
            
            // Query records
            System.out.println("\nAll users after insertion:");
            queryUsers(databaseUrl);
            
            // Update a record
            updateUser(databaseUrl, "john.doe@example.com", "Germany");
            
            // Query records after update
            System.out.println("\nAll users after update:");
            queryUsers(databaseUrl);
            
            // Delete a record
            deleteUser(databaseUrl, "alice.brown@example.com");
            
            // Query records after deletion
            System.out.println("\nAll users after deletion:");
            queryUsers(databaseUrl);
            
        } catch (SQLException e) {
            System.err.println("Database error: " + e.getMessage());
        }
    }
    
    private static Connection getConnection(String databaseUrl) throws SQLException {
        return DriverManager.getConnection(databaseUrl);
    }
    
    private static void createTable(String databaseUrl) throws SQLException {
        String createTableSQL = "CREATE TABLE IF NOT EXISTS users (" +
                "id SERIAL PRIMARY KEY, " +
                "name VARCHAR(100) NOT NULL, " +
                "email VARCHAR(100) NOT NULL UNIQUE, " +
                "country VARCHAR(50), " +
                "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)";
        
        try (Connection connection = getConnection(databaseUrl);
             Statement statement = connection.createStatement()) {
            statement.execute(createTableSQL);
            System.out.println("Table 'users' created successfully.");
        }
    }
    
    private static void insertUser(String databaseUrl, String name, String email, String country) throws SQLException {
        String insertSQL = "INSERT INTO users (name, email, country) VALUES (?, ?, ?)";
        
        try (Connection connection = getConnection(databaseUrl);
             PreparedStatement preparedStatement = connection.prepareStatement(insertSQL)) {
            
            preparedStatement.setString(1, name);
            preparedStatement.setString(2, email);
            preparedStatement.setString(3, country);
            
            int rowsAffected = preparedStatement.executeUpdate();
            System.out.println(rowsAffected + " user inserted: " + name);
        }
    }
    
    private static void insertMultipleUsers(String databaseUrl, List<User> users) throws SQLException {
        String insertSQL = "INSERT INTO users (name, email, country) VALUES (?, ?, ?)";
        
        try (Connection connection = getConnection(databaseUrl)) {
            connection.setAutoCommit(false);
            
            try (PreparedStatement preparedStatement = connection.prepareStatement(insertSQL)) {
                for (User user : users) {
                    preparedStatement.setString(1, user.name);
                    preparedStatement.setString(2, user.email);
                    preparedStatement.setString(3, user.country);
                    preparedStatement.addBatch();
                }
                
                int[] rowsAffected = preparedStatement.executeBatch();
                connection.commit();
                
                System.out.println("Inserted " + rowsAffected.length + " additional users.");
            } catch (SQLException e) {
                connection.rollback();
                throw e;
            }
        }
    }
    
    private static void queryUsers(String databaseUrl) throws SQLException {
        String selectSQL = "SELECT * FROM users";
        
        try (Connection connection = getConnection(databaseUrl);
             PreparedStatement preparedStatement = connection.prepareStatement(selectSQL);
             ResultSet resultSet = preparedStatement.executeQuery()) {
            
            System.out.println("-------------------------------");
            
            while (resultSet.next()) {
                int id = resultSet.getInt("id");
                String name = resultSet.getString("name");
                String email = resultSet.getString("email");
                String country = resultSet.getString("country");
                
                System.out.printf("ID: %d, Name: %s, Email: %s, Country: %s%n", 
                        id, name, email, country);
            }
            
            System.out.println("-------------------------------");
        }
    }
    
    private static void updateUser(String databaseUrl, String email, String newCountry) throws SQLException {
        String updateSQL = "UPDATE users SET country = ? WHERE email = ?";
        
        try (Connection connection = getConnection(databaseUrl);
             PreparedStatement preparedStatement = connection.prepareStatement(updateSQL)) {
            
            preparedStatement.setString(1, newCountry);
            preparedStatement.setString(2, email);
            
            int rowsAffected = preparedStatement.executeUpdate();
            System.out.println(rowsAffected + " user updated: " + email + " now in " + newCountry);
        }
    }
    
    private static void deleteUser(String databaseUrl, String email) throws SQLException {
        String deleteSQL = "DELETE FROM users WHERE email = ?";
        
        try (Connection connection = getConnection(databaseUrl);
             PreparedStatement preparedStatement = connection.prepareStatement(deleteSQL)) {
            
            preparedStatement.setString(1, email);
            
            int rowsAffected = preparedStatement.executeUpdate();
            System.out.println(rowsAffected + " user deleted: " + email);
        }
    }
}
