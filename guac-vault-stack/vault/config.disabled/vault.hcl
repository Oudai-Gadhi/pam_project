storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8210"
  tls_disable = true
}

disable_mlock = true
api_addr      = "http://0.0.0.0:8210"
ui            = true
