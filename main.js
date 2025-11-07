import express from "express";
import axios from "axios";
import "dotenv/config";

const API_BASE_URL = process.env.NOCODB_URL + "/api/v2/tables";
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;

const app = express();

// Formatear fecha: ddmmyy
function formatDate(dateString) {
    const [yyyy, mm, dd] = dateString.split("-");
    const yy = yyyy.slice(-2);
    return `${yy}${mm}${dd}`;
}

// Generar código: ddmmyy-### (correlativo)
function generateCode(fecha, correlativo, digits) {
    const fechaFormateada = formatDate(fecha);
    const numeroCorrelativo = String(correlativo).padStart(digits, "0");
    return `${fechaFormateada}-${numeroCorrelativo}`;
}

app.get("/generate-codes", async (req, res) => {
    const tableId = req.query.tableId;
    const codeField = req.query.codeField || "Código";
    const dateField = req.query.dateField || "Fecha";
    const digits = parseInt(req.query.digits) || 2;
    const limit = parseInt(req.query.limit) || 10;

    if (!tableId) {
        return res.status(400).json({
            success: false,
            message: "Falta tableId: /generate-codes?tableId=XXXX",
        });
    }

    try {
        console.log(
            `Buscando ${limit} registros sin ${codeField} en tabla ${tableId}...`
        );

        const url = `${API_BASE_URL}/${tableId}/records?where=(${codeField},is,null)&limit=${limit}&sort=-Id&fields=Id,CreatedAt,${codeField},${dateField}`;

        const response = await axios.get(url, {
            headers: { "xc-token": API_TOKEN },
        });

        const registros = response.data.list || [];
        console.log(`Registros sin código encontrados: ${registros.length}`);

        if (registros.length === 0) {
            return res.json({
                success: true,
                message: `No hay registros sin ${codeField}`,
                procesados: 0,
            });
        }

        const correlativosPorFecha = {};
        const actualizaciones = [];

        for (const registro of registros) {
            const fecha = registro[dateField];
            if (!fecha) {
                console.warn(
                    `Registro ${registro.Id} tiene ${dateField} vacío, omitido...`
                );
                continue;
            }

            const fechaKey = formatDate(fecha);
            const correlativo = (correlativosPorFecha[fechaKey] || 0) + 1;
            const codigo = generateCode(fecha, correlativo, digits);

            console.log(`Asignando código ${codigo} → ID ${registro.Id}`);

            try {
                await axios.patch(
                    `${API_BASE_URL}/${tableId}/records`,
                    {
                        Id: registro.Id,
                        [codeField]: codigo,
                    },
                    {
                        headers: {
                            "xc-token": API_TOKEN,
                            "Content-Type": "application/json",
                        },
                    }
                );

                correlativosPorFecha[fechaKey] = correlativo;
                actualizaciones.push({ id: registro.Id, codigo, fecha });
            } catch (err) {
                console.error(
                    `Error actualizando ID ${registro.Id}:`,
                    err.message
                );
            }
        }

        res.json({
            success: true,
            message: "Códigos generados exitosamente",
            procesados: actualizaciones.length,
            detalles: actualizaciones,
        });
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Health Check
app.get("/", (req, res) => {
    res.status(200).json({
        status: "✅ Server running",
        name: "NocoDB Code Generator Service",
        description:
            "Este servicio asigna códigos automáticos basados en la fecha a los registros que no tienen código.",
        usage: {
            endpoint: "/generate-codes",
            method: "GET",
            queryParams: {
                tableId: "ID de la tabla (requerido)",
                dateField: "Nombre de la columna de fecha (default: Fecha)",
                codeField: "Nombre de la columna del código (default: Código)",
                digits: "Cantidad de dígitos del correlativo (default: 2)",
                limit: "Cantidad de registros a procesar por ejecución (default: 10)",
            },
        },
        example: {
            url: `https://nocodb.example.com/generate-codes?tableId=mhwj2qg4d0u9xgx&dateField=Fecha&codeField=Código&digits=3&limit=10`,
        },
        author: "🔥 fcarrasco@primaverasac.com",
        about: "Si ves este mensaje, la API está activa y lista para ejecutar tareas automáticas.",
    });
});

app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`);
});
