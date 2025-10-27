package com.example.entity

import io.micronaut.serde.annotation.Serdeable
import io.micronaut.data.annotation.GeneratedValue
import io.micronaut.data.annotation.Id
import io.micronaut.data.annotation.MappedEntity

@MappedEntity
@Serdeable.Serializable
@Serdeable.Deserializable
data class Book(
    @field:Id
    @field:GeneratedValue
    var id: Long? = null,
    var title: String,
    var author: String
)
