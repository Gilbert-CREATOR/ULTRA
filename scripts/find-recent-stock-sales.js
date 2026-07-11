const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv() {
    const result = {};
    const file = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    for (const line of file.split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#')) continue;
        const index = line.indexOf('=');
        if (index < 1) continue;
        result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return result;
}

async function main() {
    const env = loadEnv();
    const connection = await mysql.createConnection({
        host: env.MYSQL_HOST,
        port: Number(env.MYSQL_PORT || 3306),
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD || '',
        database: env.MYSQL_DATABASE
    });
    const requestedCode = process.argv[2];
    if (requestedCode) {
        const [products] = await connection.query(`
            SELECT codigo, articulo_codigo, codigo_usr, nombre, activo, disponible, catalogo,
                   fecha_hora_crea, fecha_hora_actualiza
            FROM articulo_servicio
            WHERE codigo = ? OR articulo_codigo = ? OR codigo_usr = ?
        `, [requestedCode, requestedCode, requestedCode]);
        console.log('Productos coincidentes:');
        console.table(products);
        if (!products.length) {
            await connection.end();
            return;
        }
        const internalCodes = products.map(product => product.codigo);
        const placeholders = internalCodes.map(() => '?').join(',');
        const [invoiceRows] = await connection.query(`
            SELECT f.factura_no, f.no_interno, f.fecha, f.fecha_hora_crea, f.fecha_hora_actualiza,
                   f.anulada, f.estado, fd.codigo, fd.codigo_usr, fd.nombre,
                   fd.cantidad, fd.devuelto, fd.almacen_codigo
            FROM factura f
            INNER JOIN factura_detalle fd ON fd.no_interno = f.no_interno
            WHERE fd.codigo IN (${placeholders}) OR fd.codigo_usr = ?
            ORDER BY f.fecha_hora_crea DESC, f.no_interno DESC
            LIMIT 30
        `, [...internalCodes, requestedCode]);
        console.log('Facturas encontradas:');
        console.table(invoiceRows);
        const [existenceRows] = await connection.query(`
            SELECT e.no_trans, e.articulo_codigo, e.almacen_codigo, e.cantidad, e.existencia,
                   e.no_documento, e.origen, e.fecha_hora_crea,
                   ec.origen AS control_origen, ec.fecha_hora_crea AS control_fecha
            FROM existencia e
            LEFT JOIN existencia_control ec ON ec.no_trans = e.no_existencia_control
            WHERE e.articulo_codigo IN (${placeholders})
            ORDER BY COALESCE(ec.fecha_hora_crea, e.fecha_hora_crea) DESC, e.no_trans DESC
        `, internalCodes);
        console.log('Existencia y controles:');
        console.table(existenceRows);
        const [schemas] = await connection.query(`
            SELECT TABLE_SCHEMA
            FROM information_schema.TABLES
            WHERE TABLE_NAME = 'factura'
              AND TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')
            ORDER BY TABLE_SCHEMA
        `);
        const crossDatabase = [];
        for (const schema of schemas) {
            try {
                const [matches] = await connection.query(`
                    SELECT ? AS base_datos, f.factura_no, f.no_interno, f.fecha,
                           f.fecha_hora_crea, f.anulada, fd.codigo, fd.codigo_usr,
                           fd.nombre, fd.cantidad, fd.devuelto
                    FROM \`${schema.TABLE_SCHEMA}\`.factura f
                    INNER JOIN \`${schema.TABLE_SCHEMA}\`.factura_detalle fd ON fd.no_interno = f.no_interno
                    INNER JOIN \`${schema.TABLE_SCHEMA}\`.articulo_servicio a ON a.codigo = fd.codigo
                    WHERE (a.articulo_codigo = ? OR fd.codigo_usr = ?)
                      AND (f.fecha = CURRENT_DATE() OR DATE(f.fecha_hora_crea) = CURRENT_DATE())
                    ORDER BY f.fecha_hora_crea DESC
                `, [schema.TABLE_SCHEMA, requestedCode, requestedCode]);
                crossDatabase.push(...matches);
            } catch {
                // La cuenta puede no tener acceso de lectura a todas las bases.
            }
        }
        console.log('Coincidencias de hoy en todas las bases accesibles:');
        console.table(crossDatabase);
        try {
            const [binaryStatus] = await connection.query('SHOW BINARY LOG STATUS');
            console.log('Estado de binary log:');
            console.table(binaryStatus);
        } catch (error) {
            console.log(`Binary log no accesible con este usuario: ${error.message}`);
        }
        await connection.end();
        return;
    }
    const [clockRows] = await connection.query('SELECT CURRENT_DATE() AS database_date, NOW() AS database_time');
    const databaseDate = clockRows[0].database_date;
    const [todayRows] = await connection.query(`
        SELECT
            f.no_interno,
            f.factura_no,
            f.fecha,
            f.fecha_hora_crea,
            f.anulada,
            f.estado AS factura_estado,
            fd.codigo AS articulo_codigo,
            fd.codigo_usr,
            fd.nombre,
            fd.cantidad,
            fd.devuelto,
            fd.estado AS detalle_estado,
            COALESCE(e.existencia_total, 0) AS existencia_actual
        FROM factura f
        INNER JOIN factura_detalle fd ON fd.no_interno = f.no_interno
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = fd.codigo
        WHERE DATE(f.fecha_hora_crea) = CURRENT_DATE()
          AND fd.tipo_articulo_servicio = 'Articulo'
        ORDER BY f.fecha_hora_crea ASC, f.no_interno ASC, fd.orden ASC
    `);
    console.log(`Fecha/hora de la base: ${clockRows[0].database_time.toISOString()}`);
    console.log(`Artículos facturados hoy (${databaseDate.toISOString().slice(0, 10)}): ${todayRows.length}`);
    console.table(todayRows.map(row => ({
        factura: row.factura_no,
        hora: row.fecha_hora_crea,
        anulada: Boolean(row.anulada),
        codigo: row.articulo_codigo,
        codigo_usr: row.codigo_usr,
        producto: row.nombre,
        cantidad: Number(row.cantidad),
        devuelto: Number(row.devuelto || 0),
        venta_neta: Number(row.cantidad) - Number(row.devuelto || 0),
        existencia_actual: Number(row.existencia_actual)
    })));
    if (!todayRows.length) {
        for (const table of ['factura', 'documento_no_venta', 'existencia_control']) {
            const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
            console.log(`${table}: ${columns.map(column => column.Field).join(', ')}`);
        }
        const [dateSummary] = await connection.query(`
            SELECT
                (SELECT MAX(fecha_hora_crea) FROM factura) AS ultima_factura_creada,
                (SELECT MAX(fecha) FROM factura) AS ultima_fecha_comercial,
                (SELECT COUNT(*) FROM factura WHERE fecha = CURRENT_DATE()) AS facturas_fecha_hoy,
                (SELECT COUNT(*) FROM documento_no_venta WHERE fecha = CURRENT_DATE()) AS documentos_no_venta_hoy,
                (SELECT COUNT(*) FROM existencia_control WHERE DATE(fecha_hora_crea) = CURRENT_DATE()) AS controles_existencia_hoy,
                (SELECT MAX(fecha_hora_crea) FROM existencia_control) AS ultimo_control_existencia
        `);
        console.table(dateSummary);
        const [stockControls] = await connection.query(`
            SELECT ec.no_trans, ec.origen, ec.fecha_hora_crea,
                   e.articulo_codigo, a.articulo_codigo AS codigo_usr, a.nombre,
                   e.cantidad, e.existencia, e.no_documento, e.almacen_codigo
            FROM existencia_control ec
            INNER JOIN existencia e ON e.no_existencia_control = ec.no_trans
            INNER JOIN articulo_servicio a ON a.codigo = e.articulo_codigo
            WHERE DATE(ec.fecha_hora_crea) = CURRENT_DATE()
            ORDER BY ec.fecha_hora_crea, ec.no_trans, e.articulo_codigo
        `);
        console.log(`Movimientos de existencia de hoy: ${stockControls.length}`);
        console.table(stockControls);
        await connection.end();
        return;
    }

    const [rows] = await connection.query(`
        SELECT
            f.no_interno,
            f.factura_no,
            f.fecha,
            f.fecha_hora_crea,
            f.anulada,
            fd.codigo AS articulo_codigo,
            fd.codigo_usr,
            fd.nombre,
            fd.cantidad,
            fd.devuelto,
            fd.almacen_codigo,
            COALESCE(e.existencia_total, 0) AS existencia_actual
        FROM factura f
        INNER JOIN factura_detalle fd ON fd.no_interno = f.no_interno
        LEFT JOIN (
            SELECT articulo_codigo, SUM(existencia) AS existencia_total
            FROM existencia
            GROUP BY articulo_codigo
        ) e ON e.articulo_codigo = fd.codigo
        WHERE COALESCE(f.anulada, 0) = 0
          AND fd.tipo_articulo_servicio = 'Articulo'
          AND fd.cantidad > COALESCE(fd.devuelto, 0)
        ORDER BY f.fecha_hora_crea DESC, f.no_interno DESC, fd.orden ASC
        LIMIT 30
    `);
    console.table(rows.map(row => ({
        factura: row.factura_no,
        fecha: row.fecha_hora_crea,
        codigo: row.articulo_codigo,
        codigo_usr: row.codigo_usr,
        producto: row.nombre,
        vendido: Number(row.cantidad) - Number(row.devuelto || 0),
        existencia_actual: Number(row.existencia_actual)
    })));
    const latestTwoItemInvoice = rows.find(row =>
        rows.filter(other => other.no_interno === row.no_interno).length === 2
    );
    if (latestTwoItemInvoice) {
        const invoiceRows = rows.filter(row => row.no_interno === latestTwoItemInvoice.no_interno);
        const codes = invoiceRows.map(row => row.articulo_codigo);
        const [movements] = await connection.query(`
            SELECT articulo_codigo, no_documento, origen, cantidad, existencia, almacen_codigo, fecha_hora_crea
            FROM existencia
            WHERE articulo_codigo IN (?, ?)
            ORDER BY fecha_hora_crea DESC, no_trans DESC
            LIMIT 12
        `, codes);
        console.log(`\nMovimientos de la factura con dos artículos (${latestTwoItemInvoice.factura_no}):`);
        console.table(movements);
    }
    await connection.end();
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
