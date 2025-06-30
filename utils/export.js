const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const generatePDF = async (resume, template, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
      });
      
      const chunks = [];
      doc.on('data', chunks.push.bind(chunks));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Apply template styles
      const styles = getTemplateStyles(template);
      
      // Header
      doc.fontSize(styles.nameSize)
         .font('Helvetica-Bold')
         .text(resume.data.personal.name || 'Your Name', { align: 'center' });
      
      doc.fontSize(styles.contactSize)
         .font('Helvetica')
         .fillColor('#666666');
      
      const contact = [];
      if (resume.data.personal.email) contact.push(resume.data.personal.email);
      if (resume.data.personal.phone) contact.push(resume.data.personal.phone);
      if (resume.data.personal.location) contact.push(resume.data.personal.location);
      
      doc.text(contact.join(' • '), { align: 'center' });
      
      if (resume.data.personal.linkedin || resume.data.personal.website) {
        const links = [];
        if (resume.data.personal.linkedin) links.push(resume.data.personal.linkedin);
        if (resume.data.personal.website) links.push(resume.data.personal.website);
        doc.text(links.join(' • '), { align: 'center' });
      }
      
      doc.moveDown();

      // Summary
      if (resume.data.summary) {
        addSection(doc, 'Professional Summary', styles);
        doc.fontSize(styles.textSize)
           .fillColor('#333333')
           .text(resume.data.summary, { align: 'justify' });
        doc.moveDown();
      }

      // Experience
      if (resume.data.experience && resume.data.experience.length > 0) {
        addSection(doc, 'Experience', styles);
        
        resume.data.experience.forEach((exp, index) => {
          doc.fontSize(styles.subheadingSize)
             .font('Helvetica-Bold')
             .fillColor('#333333')
             .text(exp.title || 'Position Title');
          
          doc.fontSize(styles.textSize)
             .font('Helvetica')
             .fillColor('#666666')
             .text(`${exp.company || 'Company'} | ${exp.duration || 'Duration'}`);
          
          if (exp.description) {
            doc.fontSize(styles.textSize)
               .fillColor('#333333')
               .text(exp.description, { align: 'justify' });
          }
          
          if (exp.achievements && exp.achievements.length > 0) {
            exp.achievements.forEach(achievement => {
              doc.text(`• ${achievement}`, { indent: 20 });
            });
          }
          
          if (index < resume.data.experience.length - 1) {
            doc.moveDown(0.5);
          }
        });
        doc.moveDown();
      }

      // Education
      if (resume.data.education && resume.data.education.length > 0) {
        addSection(doc, 'Education', styles);
        
        resume.data.education.forEach(edu => {
          doc.fontSize(styles.subheadingSize)
             .font('Helvetica-Bold')
             .fillColor('#333333')
             .text(edu.degree || 'Degree');
          
          doc.fontSize(styles.textSize)
             .font('Helvetica')
             .fillColor('#666666')
             .text(`${edu.institution || 'Institution'} | ${edu.duration || 'Duration'}`);
          
          if (edu.gpa) {
            doc.text(`GPA: ${edu.gpa}`);
          }
        });
        doc.moveDown();
      }

      // Skills
      if (resume.data.skills) {
        addSection(doc, 'Skills', styles);
        
        if (resume.data.skills.technical && resume.data.skills.technical.length > 0) {
          doc.fontSize(styles.textSize)
             .font('Helvetica-Bold')
             .text('Technical Skills: ', { continued: true })
             .font('Helvetica')
             .text(resume.data.skills.technical.join(', '));
        }
        
        if (resume.data.skills.soft && resume.data.skills.soft.length > 0) {
          doc.fontSize(styles.textSize)
             .font('Helvetica-Bold')
             .text('Soft Skills: ', { continued: true })
             .font('Helvetica')
             .text(resume.data.skills.soft.join(', '));
        }
        doc.moveDown();
      }

      // Add watermark for free users
      if (options.watermark) {
        doc.save();
        doc.fontSize(40)
           .fillColor('#cccccc')
           .opacity(0.3)
           .rotate(-45, { origin: [300, 400] })
           .text('ResumeCraft AI - Free Version', 100, 400);
        doc.restore();
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const generateDOCX = async (resume, template) => {
  const styles = getTemplateStyles(template);
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Header
        new Paragraph({
          text: resume.data.personal.name || 'Your Name',
          heading: HeadingLevel.TITLE,
          alignment: 'center',
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: [
                resume.data.personal.email,
                resume.data.personal.phone,
                resume.data.personal.location,
              ].filter(Boolean).join(' • '),
              size: 24,
            }),
          ],
          alignment: 'center',
        }),
        
        // Summary
        ...(resume.data.summary ? [
          new Paragraph({
            text: 'Professional Summary',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: resume.data.summary,
            spacing: { after: 200 },
          }),
        ] : []),
        
        // Experience
        ...(resume.data.experience && resume.data.experience.length > 0 ? [
          new Paragraph({
            text: 'Experience',
            heading: HeadingLevel.HEADING_1,
          }),
          ...resume.data.experience.flatMap(exp => [
            new Paragraph({
              children: [
                new TextRun({
                  text: exp.title || 'Position',
                  bold: true,
                }),
              ],
            }),
            new Paragraph({
              text: `${exp.company || 'Company'} | ${exp.duration || 'Duration'}`,
              spacing: { after: 100 },
            }),
            ...(exp.description ? [
              new Paragraph({
                text: exp.description,
                spacing: { after: 200 },
              }),
            ] : []),
          ]),
        ] : []),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
};

function getTemplateStyles(template) {
  const styles = {
    modern: {
      nameSize: 24,
      headingSize: 16,
      subheadingSize: 14,
      textSize: 11,
      contactSize: 10,
      headingColor: '#2563eb',
      lineHeight: 1.5,
    },
    professional: {
      nameSize: 22,
      headingSize: 14,
      subheadingSize: 12,
      textSize: 11,
      contactSize: 10,
      headingColor: '#000000',
      lineHeight: 1.4,
    },
    creative: {
      nameSize: 28,
      headingSize: 18,
      subheadingSize: 14,
      textSize: 11,
      contactSize: 10,
      headingColor: '#8b5cf6',
      lineHeight: 1.6,
    },
    minimal: {
      nameSize: 20,
      headingSize: 14,
      subheadingSize: 12,
      textSize: 10,
      contactSize: 9,
      headingColor: '#000000',
      lineHeight: 1.3,
    },
  };
  
  return styles[template] || styles.modern;
}

function addSection(doc, title, styles) {
  doc.fontSize(styles.headingSize)
     .font('Helvetica-Bold')
     .fillColor(styles.headingColor)
     .text(title.toUpperCase());
  
  doc.moveTo(50, doc.y)
     .lineTo(545, doc.y)
     .stroke(styles.headingColor);
  
  doc.moveDown(0.5);
}

module.exports = { generatePDF, generateDOCX };