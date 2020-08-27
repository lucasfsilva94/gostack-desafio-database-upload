import csvParse from 'csv-parse';
import fs from 'fs';
import { getRepository, In, getCustomRepository } from 'typeorm';
import Category from '../models/Category';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransactions {
  title: string,
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const readStream = fs.createReadStream(filePath);
    const parsers = csvParse({
      from_line: 2,
      ltrim: true,
    });
    const pipeCSV = readStream.pipe(parsers);

    const categories: string[] = [];
    const transactions: CSVTransactions[] = [];

    pipeCSV.on('data', async line => {
      const [title, type, value, category] = line;
      if (!title || !type || !value || !category) return;
      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => pipeCSV.on('end', resolve));
    const categoriesRepository = getRepository(Category);
    const setaddCategoryTitles = Array.from(new Set(categories));
    const existentCategories = await categoriesRepository.find({
      where: { title: In(setaddCategoryTitles) }
    });
    const existentCategoriesTitles = existentCategories.map(
      (categoryTitle: Category) => categoryTitle.title);
    const addCategoriesTitles = setaddCategoryTitles.filter(
      category => !existentCategoriesTitles.includes(category),
    );
    const newCategories = categoriesRepository.create(
      addCategoriesTitles.map(title => ({
        title,
      })),
    );
    await categoriesRepository.save(newCategories);

    const allCategories = [...existentCategories, ...newCategories];
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const createTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );
    await transactionsRepository.save(createTransactions);
    await fs.promises.unlink(filePath);
    return createTransactions;
  }
}

export default ImportTransactionsService;
