package com.example.entity

import io.micronaut.data.annotation.GeneratedValue
import io.micronaut.data.annotation.Id
import io.micronaut.data.annotation.MappedEntity

@MappedEntity
data class Book(
    @field:Id
    @field:GeneratedValue
    var id: Long? = null,
    var title: String,
    var author: String
)
