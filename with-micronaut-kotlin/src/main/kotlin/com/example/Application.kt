package com.example

import io.micronaut.runtime.Micronaut

object Application {
    @JvmStatic
    fun main(args: Array<String>) {
        Micronaut.build()
            .packages("com.example")
            .mainClass(Application.javaClass)
            .start()
    }
}
