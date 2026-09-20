import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ExportData {
  period: string;
  establishmentName?: string;
  kpis: { label: string; value: string }[];
  salesByDay: { date: string; ventas: number; pedidos: number }[];
  productRanking: { name: string; qty: number; revenue: number }[];
  drinkRanking?: { name: string; qty: number; revenue: number }[];
  categoryRevenue: { name: string; revenue: number }[];
  paymentBreakdown: { name: string; value: number }[];
  incomeByDay?: { date: string; ingresos: number }[];
  expensesByDay?: { date: string; gastos: number }[];
  expensesByCategory?: { name: string; amount: number }[];
}

export function exportAnalyticsPDF(data: ExportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen de Analíticas', pageWidth / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(data.period, pageWidth / 2, y, { align: 'center' });
  if (data.establishmentName) {
    y += 5;
    doc.text(data.establishmentName, pageWidth / 2, y, { align: 'center' });
  }
  y += 10;

  // KPIs
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Indicadores clave', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: data.kpis.map(k => [k.label, k.value]),
    theme: 'striped',
    headStyles: { fillColor: [249, 115, 22] },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Ventas por día
  if (data.salesByDay.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Ventas por día', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Ventas ($)', 'Pedidos']],
      body: data.salesByDay.map(r => [r.date, `$${r.ventas.toLocaleString('es-AR')}`, r.pedidos]),
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Ranking productos
  if (data.productRanking.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Ranking de platos', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Plato', 'Cantidad', 'Ingresos ($)']],
      body: data.productRanking.slice(0, 20).map(p => [p.name, p.qty, `$${p.revenue.toLocaleString('es-AR')}`]),
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Ranking bebidas
  if (data.drinkRanking && data.drinkRanking.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Ranking de bebidas', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Bebida', 'Cantidad', 'Ingresos ($)']],
      body: data.drinkRanking.slice(0, 20).map(p => [p.name, p.qty, `$${p.revenue.toLocaleString('es-AR')}`]),
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }


  // Medios de pago
  if (data.paymentBreakdown.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Medios de pago', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Método', 'Total ($)']],
      body: data.paymentBreakdown.map(p => [p.name, `$${p.value.toLocaleString('es-AR')}`]),
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Gastos por categoría
  if (data.expensesByCategory && data.expensesByCategory.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Gastos por categoría', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Categoría', 'Total ($)']],
      body: data.expensesByCategory.map(e => [e.name, `$${e.amount.toLocaleString('es-AR')}`]),
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado el ${new Date().toLocaleDateString('es-AR')} — Página ${i}/${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  doc.save(`analiticas_${data.period.replace(/\s/g, '_')}.pdf`);
}

export function exportAnalyticsExcel(data: ExportData) {
  const wb = XLSX.utils.book_new();

  // KPIs
  const kpiWs = XLSX.utils.aoa_to_sheet([
    ['Indicador', 'Valor'],
    ...data.kpis.map(k => [k.label, k.value]),
  ]);
  XLSX.utils.book_append_sheet(wb, kpiWs, 'KPIs');

  // Ventas por día
  if (data.salesByDay.length > 0) {
    const salesWs = XLSX.utils.json_to_sheet(data.salesByDay.map(r => ({
      Fecha: r.date, Ventas: r.ventas, Pedidos: r.pedidos,
    })));
    XLSX.utils.book_append_sheet(wb, salesWs, 'Ventas por día');
  }

  // Ranking platos
  if (data.productRanking.length > 0) {
    const prodWs = XLSX.utils.json_to_sheet(data.productRanking.map(p => ({
      Plato: p.name, Cantidad: p.qty, Ingresos: p.revenue,
    })));
    XLSX.utils.book_append_sheet(wb, prodWs, 'Platos');
  }

  // Ranking bebidas
  if (data.drinkRanking && data.drinkRanking.length > 0) {
    const drinkWs = XLSX.utils.json_to_sheet(data.drinkRanking.map(p => ({
      Bebida: p.name, Cantidad: p.qty, Ingresos: p.revenue,
    })));
    XLSX.utils.book_append_sheet(wb, drinkWs, 'Bebidas');
  }


  // Ingresos por categoría
  if (data.categoryRevenue.length > 0) {
    const catWs = XLSX.utils.json_to_sheet(data.categoryRevenue.map(c => ({
      Categoría: c.name, Ingresos: c.revenue,
    })));
    XLSX.utils.book_append_sheet(wb, catWs, 'Categorías');
  }

  // Medios de pago
  if (data.paymentBreakdown.length > 0) {
    const payWs = XLSX.utils.json_to_sheet(data.paymentBreakdown.map(p => ({
      Método: p.name, Total: p.value,
    })));
    XLSX.utils.book_append_sheet(wb, payWs, 'Medios de pago');
  }

  // Ingresos diarios
  if (data.incomeByDay && data.incomeByDay.length > 0) {
    const incWs = XLSX.utils.json_to_sheet(data.incomeByDay.map(r => ({
      Fecha: r.date, Ingresos: r.ingresos,
    })));
    XLSX.utils.book_append_sheet(wb, incWs, 'Ingresos diarios');
  }

  // Gastos diarios
  if (data.expensesByDay && data.expensesByDay.length > 0) {
    const expWs = XLSX.utils.json_to_sheet(data.expensesByDay.map(r => ({
      Fecha: r.date, Gastos: r.gastos,
    })));
    XLSX.utils.book_append_sheet(wb, expWs, 'Gastos diarios');
  }

  // Gastos por categoría
  if (data.expensesByCategory && data.expensesByCategory.length > 0) {
    const expCatWs = XLSX.utils.json_to_sheet(data.expensesByCategory.map(e => ({
      Categoría: e.name, Total: e.amount,
    })));
    XLSX.utils.book_append_sheet(wb, expCatWs, 'Gastos categoría');
  }

  XLSX.writeFile(wb, `analiticas_${data.period.replace(/\s/g, '_')}.xlsx`);
}
