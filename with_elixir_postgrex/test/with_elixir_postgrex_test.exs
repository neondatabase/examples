defmodule WithElixirPostgrexTest do
  use ExUnit.Case
  doctest WithElixirPostgrex

  test "greets the world" do
    assert WithElixirPostgrex.hello() == :world
  end
end
