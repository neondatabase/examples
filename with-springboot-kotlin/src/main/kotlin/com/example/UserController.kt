package com.example

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime

@RestController
@RequestMapping("/users")
class UserController(private val repo: UserRepository) {

    @GetMapping
    fun all(): List<User> = repo.findAll()

    @GetMapping("/{id}")
    fun byId(@PathVariable id: Long): User? =
        repo.findById(id).orElse(null)

    @PostMapping
    fun add(@RequestBody dto: CreateUserDto): User =
        repo.save(
            User(
                name = dto.name,
                email = dto.email,
                createdAt = OffsetDateTime.now()
            )
        )

    @GetMapping("/search")
    fun search(@RequestParam name: String): List<User> =
        repo.findByNameContaining(name)
}

data class CreateUserDto(val name: String, val email: String)
