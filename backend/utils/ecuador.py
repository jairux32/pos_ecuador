PROVINCIAS_ECUADOR = {
    "Azuay": ["Cuenca", "Gualaceo", "Paute", "Santa Isabel", "Sigsig", "Girón"],
    "Bolívar": ["Guaranda", "Caluma", "Chillanes", "Chimbo", "Echeandía", "San Miguel"],
    "Cañar": ["Azogues", "Biblián", "Cañar", "La Troncal", "El Tambo", "Déleg"],
    "Carchi": ["Tulcán", "Espejo", "Mira", "Montúfar", "San Pedro de Huaca", "Bolívar"],
    "Chimborazo": ["Riobamba", "Alausí", "Guano", "Colta", "Chambo", "Chunchi"],
    "Cotopaxi": ["Latacunga", "La Maná", "Pangua", "Pujilí", "Salcedo", "Saquisilí", "Sigchos"],
    "El Oro": ["Machala", "Pasaje", "Santa Rosa", "Huaquillas", "Arenillas", "Piñas"],
    "Esmeraldas": ["Esmeraldas", "Atacames", "Quinindé", "San Lorenzo", "Muisne", "Eloy Alfaro"],
    "Galápagos": ["Puerto Baquerizo Moreno", "Puerto Ayora", "Puerto Villamil"],
    "Guayas": ["Guayaquil", "Durán", "Milagro", "Daule", "Samborondón", "Playas", "El Empalme", "Naranjal"],
    "Imbabura": ["Ibarra", "Otavalo", "Cotacachi", "Antonio Ante", "Pimampiro", "Urcuquí"],
    "Loja": ["Loja", "Catamayo", "Macará", "Cariamanga", "Saraguro", "Zapotillo"],
    "Los Ríos": ["Babahoyo", "Quevedo", "Ventanas", "Vinces", "Buena Fe", "Valencia"],
    "Manabí": ["Portoviejo", "Manta", "Chone", "El Carmen", "Jipijapa", "Pedernales", "Bahía de Caráquez"],
    "Morona Santiago": ["Macas", "Gualaquiza", "Sucúa", "Palora", "Limón Indanza"],
    "Napo": ["Tena", "Archidona", "El Chaco", "Quijos", "Carlos Julio Arosemena Tola"],
    "Orellana": ["Francisco de Orellana", "La Joya de los Sachas", "Loreto", "Aguarico"],
    "Pastaza": ["Puyo", "Mera", "Santa Clara", "Arajuno"],
    "Pichincha": ["Quito", "Cayambe", "Mejía", "Pedro Moncayo", "Rumiñahui", "San Miguel de los Bancos", "Pedro Vicente Maldonado", "Puerto Quito"],
    "Santa Elena": ["Santa Elena", "La Libertad", "Salinas"],
    "Santo Domingo de los Tsáchilas": ["Santo Domingo", "La Concordia"],
    "Sucumbíos": ["Nueva Loja", "Shushufindi", "Gonzalo Pizarro", "Cascales", "Lago Agrio"],
    "Tungurahua": ["Ambato", "Baños de Agua Santa", "Pelileo", "Píllaro", "Patate", "Cevallos"],
    "Zamora-Chinchipe": ["Zamora", "Yantzaza", "Centinela del Cóndor", "Nangaritza", "Chinchipe"]
}

SECTORES_NEGOCIO = [
    "Abarrotes",
    "Ropa y Calzado",
    "Ferretería",
    "Farmacia",
    "Tecnología",
    "Restaurante",
    "Servicios",
    "Papelería",
    "Automotriz",
    "Otro"
]

REGIMENES_TRIBUTARIOS = [
    "RIMPE Emprendedor",
    "RIMPE Negocio Popular",
    "Contribuyente General"
]

UNIDADES_MEDIDA = [
    "Unidad",
    "Kilogramo",
    "Gramo",
    "Litro",
    "Mililitro",
    "Metro",
    "Centímetro",
    "Caja",
    "Paquete",
    "Docena",
    "Par",
    "Rollo",
    "Galón",
    "Libra",
    "Onza"
]

TASAS_IVA = [
    {"codigo": "0", "porcentaje": 0, "descripcion": "0%"},
    {"codigo": "5", "porcentaje": 5, "descripcion": "5%"},
    {"codigo": "4", "porcentaje": 15, "descripcion": "15%"},
]

TIPOS_DOCUMENTO_SRI = {
    "01": "Factura",
    "02": "Nota de Venta",
}

MOTIVOS_AJUSTE_INVENTARIO = [
    "Merma",
    "Robo",
    "Vencimiento",
    "Daño",
    "Error de conteo",
    "Devolución",
    "Otro"
]


def validar_cedula_ecuatoriana(cedula: str) -> bool:
    if not cedula or len(cedula) != 10 or not cedula.isdigit():
        return False
    provincia = int(cedula[:2])
    if provincia < 1 or provincia > 24:
        return False
    tercer_digito = int(cedula[2])
    if tercer_digito > 5:
        return False
    coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    total = 0
    for i in range(9):
        valor = int(cedula[i]) * coeficientes[i]
        if valor >= 10:
            valor -= 9
        total += valor
    verificador = 10 - (total % 10)
    if verificador == 10:
        verificador = 0
    return verificador == int(cedula[9])


def validar_ruc_ecuatoriano(ruc: str) -> bool:
    if not ruc or len(ruc) != 13 or not ruc.isdigit():
        return False
    if not ruc.endswith("001"):
        return False
    cedula_base = ruc[:10]
    return validar_cedula_ecuatoriana(cedula_base)


def generar_clave_acceso(fecha, tipo_doc, ruc, ambiente, establecimiento, punto_emision, secuencial, codigo_numerico):
    fecha_str = fecha.strftime("%d%m%Y")
    clave = (
        f"{fecha_str}"
        f"{tipo_doc:0>2}"
        f"{ruc:0>13}"
        f"{ambiente}"
        f"{establecimiento:0>3}"
        f"{punto_emision:0>3}"
        f"{secuencial:0>9}"
        f"{codigo_numerico:0>8}"
        f"1"
    )
    digito = calcular_modulo11(clave)
    return clave + str(digito)


def calcular_modulo11(clave: str) -> int:
    factores = [2, 3, 4, 5, 6, 7]
    total = 0
    for i, c in enumerate(reversed(clave)):
        total += int(c) * factores[i % len(factores)]
    residuo = total % 11
    if residuo == 0:
        return 0
    elif residuo == 1:
        return 1
    else:
        return 11 - residuo
