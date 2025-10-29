package com.example.entity

import io.micronaut.data.annotation.GeneratedValue
import io.micronaut.data.annotation.Id
import io.micronaut.data.annotation.MappedEntity
import io.micronaut.serde.annotation.Serdeable

@MappedEntity
@Serdeable
data class Book(
    @field:Id
    @field:GeneratedValue
    var id: Long? = null,
    var title: String,
    var author: String
)