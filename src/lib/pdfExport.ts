import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Export a DOM element to PDF using html2canvas for full Hebrew support
 */
export async function exportElementToPDF(
  elementId: string,
  filename: string,
  orientation: 'portrait' | 'landscape' = 'landscape'
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Element not found: ' + elementId);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgWidth = orientation === 'landscape' ? 297 : 210;
  const pageHeight = orientation === 'landscape' ? 210 : 297;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const imgData = canvas.toDataURL('image/png');

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

/**
 * Create a temporary printable div, render it, export to PDF, then remove it
 */
export async function exportTableToPDF(opts: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  filename: string;
}): Promise<void> {
  const { title, subtitle, headers, rows, totalsRow, filename } = opts;

  // Create hidden container
  const container = document.createElement('div');
  container.id = '__pdf_export_container__';
  container.style.cssText = 'position:fixed;top:-9999px;left:0;width:1100px;background:#fff;padding:32px;font-family:Heebo,Arial,sans-serif;direction:rtl;';

  // Title
  container.innerHTML = `
    <div style="text-align:center;margin-bottom:16px;">
      <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0;">${title}</h1>
      ${subtitle ? `<p style="font-size:12px;color:#64748b;margin:4px 0 0;">${subtitle}</p>` : ''}
      <p style="font-size:10px;color:#94a3b8;margin:4px 0 0;">תאריך הפקה: ${new Date().toLocaleDateString('he-IL')} ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#3b82f6;">
          ${headers.map(h => `<th style="padding:8px 10px;color:#fff;font-weight:600;text-align:center;border:1px solid #2563eb;">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
            ${row.map((cell, ci) => {
              let style = 'padding:6px 10px;text-align:center;border:1px solid #e2e8f0;';
              // Color balance column (typically second-to-last)
              if (ci === headers.length - 2) {
                const num = typeof cell === 'number' ? cell : parseFloat(String(cell).replace(/[^\d.-]/g, ''));
                if (!isNaN(num) && num > 0) style += 'color:#dc2626;font-weight:600;';
                else if (!isNaN(num) && num <= 0) style += 'color:#16a34a;font-weight:600;';
              }
              return `<td style="${style}">${cell}</td>`;
            }).join('')}
          </tr>
        `).join('')}
        ${totalsRow ? `
          <tr style="background:#e5e7eb;font-weight:700;">
            ${totalsRow.map(cell => `<td style="padding:8px 10px;text-align:center;border:1px solid #cbd5e1;">${cell}</td>`).join('')}
          </tr>
        ` : ''}
      </tbody>
    </table>
    <div style="text-align:center;margin-top:16px;font-size:9px;color:#94a3b8;">
      דוח זה הופק אוטומטית ממערכת הגבייה • ${new Date().getFullYear()}
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgWidth = 297; // landscape A4
    const pageHeight = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/png');

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Add page numbers
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`${i}/${totalPages}`, 290, 205, { align: 'right' });
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
